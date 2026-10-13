import test from 'node:test';
import assert from 'node:assert/strict';
import { Intent, type IntentResult } from '../src/index.js';
import { createIntentMcpAdapter, type HostTask, type IntentMcpSession, type IntentMcpToolResult } from '../src/mcp/index.js';
import { draft, observation, controlled } from './helpers.js';
import { ContractValidator } from '../src/internal/contracts.js';

const payload = <T>(r: IntentMcpToolResult | undefined): T => {assert(r); assert.equal(r.isError, false, r.content[0]?.text); assert.deepEqual(r.structuredContent, JSON.parse(r.content[0]!.text)); return r.structuredContent as unknown as T;};
const errorCode = (r: IntentMcpToolResult | undefined): string => {assert(r); assert.equal(r.isError, true); assert.equal('structuredContent' in r, false); return JSON.parse(r.content[0]!.text).error.code;};
async function prepare(s: IntentMcpSession, args: unknown = {input: 'query order 000123'}): Promise<HostTask> {return payload(await s.callTool('intent_prepare', args));}
const submit = (t: HostTask, text = JSON.stringify(draft())) => ({requestId: t.requestId, submissionToken: t.submissionToken, candidateText: text});

for (const version of ['2025-06-18', '2025-11-25', '2026-07-28'] as const) test('MCP executor envelope version ' + version + ', errors and unknown-tool fallback', async () => {
  const intent = new Intent({executor: controlled(() => draft())}); const adapter = createIntentMcpAdapter({instances: {main: intent}}), session = adapter.connect({protocolVersion: version});
  try {
    assert.deepEqual(adapter.tools.map(t => t.name), ['intent_parse']); const r = await session.callTool('intent_parse', {input: 'query'}); payload(r);
    assert.equal(Object.hasOwn(r!, 'resultType'), version === '2026-07-28');
    const bad = await session.callTool('intent_parse', {input: 'query', apiKey: 'caller-secret'}); assert.equal(errorCode(bad), 'INPUT_INVALID'); assert.equal(JSON.stringify(bad).includes('caller-secret'), false);
    assert.equal(await session.callTool('original_image_tool', {}), undefined); await session.close(); assert.equal(await session.callTool('original_image_tool', {}), undefined);
  } finally {await adapter.close(); await intent.dispose();}
});

test('Host uses the current candidate and real Validator while never invoking a configured executor', async () => {
  let calls = 0; const intent = new Intent({schema: {type: 'object', properties: {orderId: {type: 'string'}}}, executor: {id: 'must-not-run', async generate() {calls++; throw new Error('Unexpected model call');}}});
  const adapter = createIntentMcpAdapter({mode: 'host', instances: {orders: intent}}), s = adapter.connect({protocolVersion: '2026-07-28'});
  try {
    assert.deepEqual(adapter.tools.map(t => t.name), ['intent_prepare', 'intent_accept', 'intent_cancel']);
    const task = await prepare(s, {input: 'query order 000123', fields: ['orderId'], context: {agentState: {arbitrary: true}}, output: {diagnostics: true}});
    assert.equal(task.kind, 'model_task'); assert.equal(task.input.request && (task.input.request as any).context.agentState.arbitrary, true);
    const d = draft(); d.observations = [observation('orderId', '000123')];
    const r = payload<IntentResult>(await s.callTool('intent_accept', submit(task, JSON.stringify(d)))); assert.equal(r.effective.intents[0]!.inputs.orderId, '000123'); assert.equal(r.diagnostics!.modelCallCount, 0); assert.equal(calls, 0);
    const v = new ContractValidator(); try {assert(v.valid(adapter.tools[1]!.outputSchema, r)); assert(v.valid(adapter.tools[0]!.inputSchema, {input: 'next', baseline: r.effective, context: {free: {keys: true}}}));} finally {v.close();}
  } finally {await adapter.close(); await intent.dispose();}
});

test('Host correction preserves token, materials, capacity and does not call an executor', async () => {
  const intent = new Intent({limits: {maxConcurrentParses: 1}}), a = createIntentMcpAdapter({mode: 'host', instances: {main: intent}}), s = a.connect({protocolVersion: '2025-11-25'});
  try {
    const task = await prepare(s); assert.equal(errorCode(await s.callTool('intent_prepare', {input: 'second'})), 'RESOURCE_LIMIT');
    assert.equal(errorCode(await s.callTool('intent_accept', submit(task, '{'))), 'MODEL_OUTPUT_INVALID');
    const result = payload<IntentResult>(await s.callTool('intent_accept', submit(task))); assert.equal(result.input, 'query order 000123');
    const next = await prepare(s); assert.notEqual(next.requestId, task.requestId);
  } finally {await a.close(); await intent.dispose();}
});

test('Native and host waiting share one instance admission budget', async () => {
  const intent = new Intent({limits: {maxConcurrentParses: 1}, executor: controlled(() => draft())}), a = createIntentMcpAdapter({mode: 'host', instances: {main: intent}}), s = a.connect({protocolVersion: '2025-11-25'});
  try {const task = await prepare(s); await assert.rejects(intent.parse({input: 'native'}), {code: 'RESOURCE_LIMIT'}); payload(await s.callTool('intent_cancel', {requestId: task.requestId})); await intent.parse({input: 'native'});} finally {await a.close(); await intent.dispose();}
});

test('Host retains actual validation count when assembly rejects a correctable candidate', async () => {
  const intent = new Intent({schema: {type: 'object', properties: {x: {type: 'number'}}}, limits: {maxValidationChecks: 1}}), a = createIntentMcpAdapter({mode: 'host', instances: {main: intent}}), s = a.connect({protocolVersion: '2025-11-25'});
  try {
    const task = await prepare(s, {input: 'x=1', fields: ['x']}); const bad = draft(); bad.observations = [observation('x', 1)]; bad.changes = [];
    assert.equal(errorCode(await s.callTool('intent_accept', submit(task, JSON.stringify(bad)))), 'MODEL_OUTPUT_INVALID');
    const fixed = draft(); fixed.observations = [observation('x', 1)]; const text = JSON.stringify(fixed);
    assert.equal(errorCode(await s.callTool('intent_accept', submit(task, text))), 'RESOURCE_LIMIT');
    assert.equal(errorCode(await s.callTool('intent_accept', submit(task, text))), 'RESOURCE_LIMIT');
  } finally {await a.close(); await intent.dispose();}
});

test('Host retains actual validation count even when the worker itself reports candidate failure', async () => {
  const intent = new Intent({schema: {type: 'object', properties: {x: {type: 'number'}}}, limits: {maxValidationChecks: 1}}), a = createIntentMcpAdapter({mode: 'host', instances: {main: intent}}), s = a.connect({protocolVersion: '2025-11-25'});
  try {
    const task = await prepare(s, {input: 'x=1', fields: ['x']}); const bad = draft(); bad.observations = [observation('x', 1)];
    bad.issues = [{key: 'false-failure', ownerKey: 'a', fieldTarget: {container: 'inputs', field: 'x', path: '/x'}, category: 'data', code: 'FIELD_VALUE_INVALID', message: 'contradicts the supplied declaration', sources: [{root: 'input', pointer: ''}], candidates: [], questions: []}];
    assert.equal(errorCode(await s.callTool('intent_accept', submit(task, JSON.stringify(bad)))), 'MODEL_OUTPUT_INVALID');
    bad.issues = []; assert.equal(errorCode(await s.callTool('intent_accept', submit(task, JSON.stringify(bad)))), 'RESOURCE_LIMIT');
  } finally {await a.close(); await intent.dispose();}
});

test('Same host candidate concurrent submissions share one validation and exact completed reply', async () => {
  const intent = new Intent({schema: {type: 'object', properties: {x: {type: 'number'}}}, limits: {maxValidationChecks: 1}}), a = createIntentMcpAdapter({mode: 'host', instances: {main: intent}}), s = a.connect({protocolVersion: '2025-11-25'});
  try {
    const task = await prepare(s, {input: 'x=1', fields: ['x']}); const d = draft(); d.observations = [observation('x', 1)]; const args = submit(task, JSON.stringify(d));
    const [first, second] = await Promise.all([s.callTool('intent_accept', args), s.callTool('intent_accept', args)]); payload(first); assert.deepEqual(first, second);
    const replay = await s.callTool('intent_accept', args, {signal: AbortSignal.abort()}); assert.deepEqual(replay, first);
    (first!.structuredContent!.effective as any).intents[0].goal = 'caller-mutated'; assert.deepEqual(await s.callTool('intent_accept', args), second);
    assert.equal(errorCode(await s.callTool('intent_accept', submit(task, JSON.stringify(draft())))), 'HOST_SUBMISSION_CONFLICT');
    await intent.dispose(); assert.deepEqual(await s.callTool('intent_accept', args), second);
  } finally {await a.close(); await intent.dispose();}
});

test('Different concurrent host submissions conflict without replacing the first result', async () => {
  const intent = new Intent({schema: {type: 'object', properties: {x: {type: 'number'}}}}), a = createIntentMcpAdapter({mode: 'host', instances: {main: intent}}), s = a.connect({protocolVersion: '2025-11-25'});
  try {
    const task = await prepare(s, {input: 'x=1', fields: ['x']}); const d = draft(); d.observations = [observation('x', 1)]; const first = s.callTool('intent_accept', submit(task, JSON.stringify(d)));
    assert.equal(errorCode(await s.callTool('intent_accept', submit(task))), 'HOST_SUBMISSION_CONFLICT'); payload(await first);
  } finally {await a.close(); await intent.dispose();}
});

test('Cross-session IDs and incorrect tokens never apply a supplied abort signal', async () => {
  const intent = new Intent({}), a = createIntentMcpAdapter({mode: 'host', instances: {main: intent}}), s = a.connect({protocolVersion: '2025-11-25'}), other = a.connect({protocolVersion: '2025-11-25'});
  try {
    const task = await prepare(s); assert.equal(errorCode(await other.callTool('intent_accept', submit(task), {signal: AbortSignal.abort()})), 'HOST_REQUEST_NOT_FOUND');
    assert.equal(errorCode(await s.callTool('intent_accept', {...submit(task), submissionToken: 'wrong'}, {signal: AbortSignal.abort()})), 'HOST_SUBMISSION_CONFLICT'); payload(await s.callTool('intent_accept', submit(task)));
  } finally {await a.close(); await intent.dispose();}
});

for (const [reason, code] of [['cancelled', 'REQUEST_ABORTED'], ['refusal', 'MODEL_REFUSED'], ['incomplete', 'MODEL_OUTPUT_INCOMPLETE']] as const) test('Host cancel ' + reason + ' is terminal and idempotent', async () => {
  const intent = new Intent({}), a = createIntentMcpAdapter({mode: 'host', instances: {main: intent}}), s = a.connect({protocolVersion: '2025-11-25'});
  try {const task = await prepare(s); assert.equal(payload<any>(await s.callTool('intent_cancel', {requestId: task.requestId, reason})).status, 'cancelled'); assert.equal(payload<any>(await s.callTool('intent_cancel', {requestId: task.requestId})).status, 'already_cancelled'); assert.equal(errorCode(await s.callTool('intent_accept', submit(task))), code);} finally {await a.close(); await intent.dispose();}
});

test('Host positive deadline covers waiting; instance disposal ends a different waiting request', async () => {
  const timed = new Intent({timeoutMs: 10}), stable = new Intent({}); const a = createIntentMcpAdapter({mode: 'host', instances: {timed, stable}}), s = a.connect({protocolVersion: '2025-11-25'});
  try {const t = await prepare(s, {input: 'query', instance: 'timed'}), u = await prepare(s, {input: 'query', instance: 'stable'}); await new Promise(r => setTimeout(r, 20)); assert.equal(errorCode(await s.callTool('intent_accept', submit(t))), 'MODEL_TIMEOUT'); await stable.dispose(); assert.equal(errorCode(await s.callTool('intent_accept', submit(u))), 'INSTANCE_DISPOSED');} finally {await a.close(); await timed.dispose(); await stable.dispose();}
});

test('Adapter-wide terminal record count spans sessions and never evicts active requests', async () => {
  const intent = new Intent({}), a = createIntentMcpAdapter({mode: 'host', instances: {main: intent}}), first = a.connect({protocolVersion: '2025-11-25'}), other = a.connect({protocolVersion: '2025-11-25'});
  try {
    const active = await prepare(first), oldest = await prepare(first); payload(await first.callTool('intent_accept', submit(oldest)));
    for (let i = 0; i < 32; i++) {const task = await prepare(other); payload(await other.callTool('intent_accept', submit(task)));}
    assert.equal(errorCode(await first.callTool('intent_accept', submit(oldest))), 'HOST_REQUEST_NOT_FOUND'); payload(await first.callTool('intent_accept', submit(active)));
  } finally {await a.close(); await intent.dispose();}
});

test('Adapter-wide terminal byte limit evicts oldest replies before the count limit', async () => {
  const intent = new Intent({}), a = createIntentMcpAdapter({mode: 'host', instances: {main: intent}}), s = a.connect({protocolVersion: '2025-11-25'});
  try {
    const d = draft(); d.normalizedInput = 'x'.repeat(600000); const text = JSON.stringify(d), oldest = await prepare(s); payload(await s.callTool('intent_accept', submit(oldest, text)));
    let last: HostTask = oldest;
    for (let i = 0; i < 7; i++) {last = await prepare(s); payload(await s.callTool('intent_accept', submit(last, text)));}
    assert.equal(errorCode(await s.callTool('intent_accept', submit(oldest, text))), 'HOST_REQUEST_NOT_FOUND'); payload(await s.callTool('intent_accept', submit(last, text)));
  } finally {await a.close(); await intent.dispose();}
});

test('A completed reply larger than retention capacity is delivered once and not cached', async () => {
  const intent = new Intent({limits: {maxOutputBytes: 12582912}}), a = createIntentMcpAdapter({mode: 'host', instances: {main: intent}}), s = a.connect({protocolVersion: '2025-11-25'});
  try {const task = await prepare(s); const d = draft(); d.normalizedInput = 'x'.repeat(4500000); const args = submit(task, JSON.stringify(d)); payload(await s.callTool('intent_accept', args)); assert.equal(errorCode(await s.callTool('intent_accept', args)), 'HOST_REQUEST_NOT_FOUND');} finally {await a.close(); await intent.dispose();}
});

test('HostTask overflow and candidate overflow do not leak or refresh recognition slots', async () => {
  const small = new Intent({limits: {maxOutputBytes: 64, maxConcurrentParses: 1}}), stable = new Intent({limits: {maxConcurrentParses: 1}}), a = createIntentMcpAdapter({mode: 'host', instances: {small, stable}}), s = a.connect({protocolVersion: '2025-11-25'});
  try {
    for (let i = 0; i < 2; i++) {const r = await s.callTool('intent_prepare', {input: 'query', instance: 'small'}); assert.equal(errorCode(r), 'RESOURCE_LIMIT'); assert.equal(JSON.parse(r!.content[0]!.text).error.details.limit, 'maxOutputBytes');}
    const task = await prepare(s, {input: 'query', instance: 'stable'}); assert.equal(errorCode(await s.callTool('intent_accept', submit(task, ' '.repeat(1048577)))), 'RESOURCE_LIMIT');
    assert.equal(errorCode(await s.callTool('intent_prepare', {input: 'second', instance: 'stable'})), 'RESOURCE_LIMIT'); payload(await s.callTool('intent_accept', submit(task)));
  } finally {await a.close(); await small.dispose(); await stable.dispose();}
});

test('Session and adapter close end only owned work and leave the caller instance usable', async () => {
  const intent = new Intent({executor: controlled(() => draft())}), a = createIntentMcpAdapter({mode: 'host', instances: {main: intent}}), first = a.connect({protocolVersion: '2025-11-25'}), other = a.connect({protocolVersion: '2025-11-25'});
  try {await prepare(first); const task = await prepare(other); await first.close(); payload(await other.callTool('intent_accept', submit(task))); await a.close(); await intent.parse({input: 'still usable'}); await a.close();} finally {await intent.dispose();}
});

test('A closed host session cannot replay a retained token and reports NOT_FOUND', async () => {
  const intent = new Intent({}), a = createIntentMcpAdapter({mode: 'host', instances: {main: intent}}), s = a.connect({protocolVersion: '2025-11-25'});
  try {const task = await prepare(s); payload(await s.callTool('intent_accept', submit(task))); await s.close(); assert.equal(errorCode(await s.callTool('intent_accept', submit(task))), 'HOST_REQUEST_NOT_FOUND'); assert.equal(errorCode(await s.callTool('intent_cancel', {requestId: task.requestId})), 'HOST_REQUEST_NOT_FOUND');} finally {await a.close(); await intent.dispose();}
});

test('Host preparation checks an explicit monotonic deadline before committing its reply', async () => {
  const intent = new Intent({timeoutMs: 1, limits: {maxConcurrentParses: 1}}), a = createIntentMcpAdapter({mode: 'host', instances: {main: intent}}), s = a.connect({protocolVersion: '2025-11-25'});
  try {for (let i = 0; i < 2; i++) assert.equal(errorCode(await s.callTool('intent_prepare', {input: 'query', context: {material: 'x'.repeat(800000)}})), 'MODEL_TIMEOUT');} finally {await a.close(); await intent.dispose();}
});

test('MCP selection and configuration are exact, with no guessed default instance', async () => {
  const intent = new Intent({executor: controlled(() => draft())}), a = createIntentMcpAdapter({toolPrefix: 'orders_', instances: {default: intent, another: intent}}), s = a.connect({protocolVersion: '2025-11-25'});
  try {assert.equal(await s.callTool('intent_parse', {}), undefined); assert.equal(errorCode(await s.callTool('orders_intent_parse', {input: 'query'})), 'INPUT_INVALID'); payload(await s.callTool('orders_intent_parse', {input: 'query', instance: 'default'})); assert.throws(() => a.connect({protocolVersion: 'unknown'} as any), {code: 'CONFIG_INVALID', stage: 'transport'}); assert.throws(() => a.connect({} as any), {code: 'CONFIG_INVALID'});} finally {await a.close(); await intent.dispose();}
});

test('MCP rejects empty, reserved, unsafe and disposed instances without discovery', async () => {
  const intent = new Intent({});
  try {assert.throws(() => createIntentMcpAdapter({instances: {main: intent}}), {code: 'EXECUTOR_NOT_CONFIGURED'}); for (const name of ['constructor', 'x/y']) assert.throws(() => createIntentMcpAdapter({mode: 'host', instances: {[name]: intent}}), {code: 'CONFIG_INVALID'}); assert.throws(() => createIntentMcpAdapter({mode: 'host', instances: {}}), {code: 'CONFIG_INVALID'}); await intent.dispose(); assert.throws(() => createIntentMcpAdapter({mode: 'host', instances: {main: intent}}), {code: 'INSTANCE_DISPOSED'});} finally {await intent.dispose();}
});
