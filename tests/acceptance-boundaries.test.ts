import test from 'node:test';
import assert from 'node:assert/strict';
import {Intent, IntentError, type IntentConfig, type IntentParseRequest, type EffectiveIntentSnapshot} from '../src/index.js';
import {ValidationRunner, type ValidationTask} from '../src/schema/runner.js';
import {draft, observation, src, controlled, retain} from './helpers.js';
import {createIntentMcpAdapter, type HostTask} from '../src/mcp/index.js';

// These tests exercise the published DEFAULT sizes, rather than extrapolating
// from small overrides. A refusal proves admission reached the model boundary;
// it does not pretend that a language model understood the synthetic padding.
const bytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value));
const padded = <T extends object>(value: T, key: string, size: number): T => {
  const next = {...value, [key]: ''};
  const rest = size - bytes(next); assert(rest >= 0);
  return {...value, [key]: 'a'.repeat(rest)};
};
function refusal(config: IntentConfig = {}): {intent: Intent; calls: () => number} {
  let called = 0;
  return {intent: new Intent({...config, executor: {id: 'admission-only-no-semantic-claim', async generate() {called++; return {outcome: 'refusal'};}}}), calls: () => called};
}
const resource = (limit: string, stage: string) => (error: unknown): boolean =>
  error instanceof IntentError && error.code === 'RESOURCE_LIMIT' && error.details?.limit === limit && error.stage === stage;

test('SC-26 default candidate output accepts 1048576 bytes and rejects the next byte without truncation', async () => {
  const d = draft(); d.messages.changed = '';
  d.messages.changed = 'a'.repeat(1048576 - bytes(d)); assert.equal(bytes(d), 1048576);
  const intent = new Intent({executor: controlled(() => d)});
  try {
    const exact = await intent.parse({input: 'query A'}); assert.equal(exact.turn.intentIds.length, 1);
    d.messages.changed += 'a';
    await assert.rejects(intent.parse({input: 'query A'}), resource('maxOutputBytes', 'validation'));
    d.messages.changed = 'changed';
    assert.equal((await intent.parse({input: 'query again'})).turn.intentIds.length, 1);
  } finally {await intent.dispose();}
});

test('SC-26 default final Result measures inherited material at the real output boundary', async () => {
  let d = draft(); const intent = new Intent({executor: controlled(() => d)});
  try {
    const initial = await intent.parse({input: 'query A'});
    const baseline = initial.effective; baseline.intents[0]!.inputs.padding = '';
    d = retain(draft());
    const sample = await intent.parse({input: 'keep A', baseline});
    baseline.intents[0]!.inputs.padding = 'a'.repeat(1048576 - bytes(sample));
    const exact = await intent.parse({input: 'keep A', baseline});
    assert.equal(bytes(exact), 1048576);
    baseline.intents[0]!.inputs.padding += 'a';
    await assert.rejects(intent.parse({input: 'keep A', baseline}), resource('maxOutputBytes', 'output'));
  } finally {await intent.dispose();}
});

test('SC-26 actual HostTask admits the default output size and releases the failed next-byte lease', async () => {
  // One admission slot makes every following prepare depend on the previous lease being released.
  const intent = new Intent({limits: {maxConcurrentParses: 1}}), adapter = createIntentMcpAdapter({mode: 'host', instances: {main: intent}}), session = adapter.connect({protocolVersion: '2025-11-25'});
  const prepare = (padding: string) => session.callTool('intent_runtime_prepare', {input: 'query A', context: {padding}});
  const cancel = async (task: HostTask) => {const r = await session.callTool('intent_runtime_cancel', {requestId: task.requestId}); assert.equal(r!.isError, false, r!.content[0]?.text); assert.deepEqual(r!.structuredContent, {requestId: task.requestId, status: 'cancelled'});};
  try {
    const sample = await prepare(''); assert.equal(sample!.isError, false);
    const task = sample!.structuredContent as unknown as HostTask; await cancel(task);
    const padding = 'a'.repeat(1048576 - bytes(task));
    const exact = await prepare(padding); assert.equal(exact!.isError, false);
    assert.equal(bytes(exact!.structuredContent), 1048576); await cancel(exact!.structuredContent as unknown as HostTask);
    const exceeded = await prepare(padding + 'a'); assert.equal(exceeded!.isError, true);
    const error = JSON.parse(exceeded!.content[0]!.text).error;
    assert.equal(error.code, 'RESOURCE_LIMIT'); assert.equal(error.details.limit, 'maxOutputBytes');
    const recovered = await prepare('small'); assert.equal(recovered!.isError, false); await cancel(recovered!.structuredContent as unknown as HostTask);
  } finally {await adapter.close(); await intent.dispose();}
});

test('SC-38 real default eight parses count cancelled but physically unfinished executor work', async () => {
  const releases: Array<() => void> = [], controller = new AbortController();
  const intent = new Intent({executor: {id: 'physical-slot-boundary', generate: () => new Promise(resolve => {releases.push(() => resolve({outcome: 'refusal'}));})}});
  const outcomes: Array<Promise<unknown>> = [];
  try {
    for (let i = 0; i < 8; i++) outcomes.push(intent.parse({input: 'request ' + i}, i === 0 ? {signal: controller.signal} : undefined).catch(e => e));
    await new Promise(resolve => setImmediate(resolve)); assert.equal(releases.length, 8);
    await assert.rejects(intent.parse({input: 'ninth'}), (e: unknown) => e instanceof IntentError && e.code === 'RESOURCE_LIMIT' && e.details?.limit === 'maxConcurrentParses' && e.details.allowed === 8 && e.details.observed === 9);
    controller.abort(); assert.equal((await outcomes[0] as IntentError).code, 'REQUEST_ABORTED');
    await assert.rejects(intent.parse({input: 'still ninth'}), {code: 'RESOURCE_LIMIT'});
    releases[0]!(); await new Promise(resolve => setImmediate(resolve));
    const recovered = intent.parse({input: 'replacement'}).catch(e => e); outcomes.push(recovered);
    await new Promise(resolve => setImmediate(resolve)); assert.equal(releases.length, 9);
    releases.slice(1).forEach(release => release());
    assert.equal((await recovered as IntentError).code, 'MODEL_REFUSED');
  } finally {releases.forEach(release => release()); await Promise.all(outcomes); await intent.dispose();}
});

test('SC-26 actual default depth includes the combined logical material root at 64 and rejects 65', async () => {
  const nested = (depth: number): object => {let value = {}; for (let i = 0; i < depth; i++) value = {child: value}; return value;};
  const {intent, calls} = refusal();
  try {
    // The documented material contains request.context two containers below
    // its own root. The Context by itself still fits in both cases.
    await assert.rejects(intent.parse({input: 'query', context: nested(62)}), {code: 'MODEL_REFUSED'});
    await assert.rejects(intent.parse({input: 'query', context: nested(63)}), (cause: unknown) => resource('maxDepth', 'input')(cause) && (cause as IntentError).details?.observed === 65);
    assert.equal(calls(), 1);
  } finally {await intent.dispose();}
});

test('SC-26 final assembled children tree reaches real default depth 64 and rejects the next node', async () => {
  const chain = (count: number) => {const keys = Array.from({length: count}, (_, i) => 'n' + i), d = draft(keys); d.nodes.forEach((n, i) => {n.parentKey = i ? keys[i - 1]! : null;}); return d;};
  let d = chain(31); const intent = new Intent({executor: controlled(() => d)});
  try {
    const result = await intent.parse({input: 'explicit nested goals'});
    let node = result.effective.intents[0]!; for (let i = 1; i < 31; i++) node = node.children[0]!;
    assert.equal(node.children.length, 0);
    d = chain(32);
    await assert.rejects(intent.parse({input: 'one more nested goal'}), resource('maxDepth', 'output'));
  } finally {await intent.dispose();}
});

test('SC-26 default input budget admits exactly 65536 UTF-8 bytes and rejects the next byte', async () => {
  const {intent, calls} = refusal();
  const input = '中'.repeat(21845) + 'a'; assert.equal(Buffer.byteLength(input), 65536);
  try {
    await assert.rejects(intent.parse({input}), {code: 'MODEL_REFUSED'});
    await assert.rejects(intent.parse({input: input + 'a'}), resource('maxInputBytes', 'input'));
    assert.equal(calls(), 1);
    await assert.rejects(intent.parse({input: 'subsequent request'}), {code: 'MODEL_REFUSED'});
    assert.equal(calls(), 2);
  } finally {await intent.dispose();}
});

test('SC-26 default Context budget includes JSON encoding at exactly 1048576 bytes', async () => {
  const {intent, calls} = refusal(); const context = padded({}, 'padding', 1048576);
  assert.equal(bytes(context), 1048576);
  try {
    await assert.rejects(intent.parse({input: 'only this request', context}), {code: 'MODEL_REFUSED'});
    await assert.rejects(intent.parse({input: 'only this request', context: {...context, padding: (context as {padding: string}).padding + 'a'}}), resource('maxContextBytes', 'input'));
    assert.equal(calls(), 1);
  } finally {await intent.dispose();}
});

test('SC-26 default baseline budget admits a full valid snapshot and rejects one extra byte', async () => {
  const skeleton: EffectiveIntentSnapshot = {schemaVersion: '2.0-draft.6', coverage: 'partial', scope: 'provided_materials', intents: [], constraints: [], unresolved: [''], relations: []};
  const remaining = 1048576 - bytes(skeleton);
  const baseline = {...skeleton, unresolved: ['a'.repeat(remaining)]}; assert.equal(bytes(baseline), 1048576);
  const {intent, calls} = refusal();
  try {
    await assert.rejects(intent.parse({input: 'new unrelated request', baseline}), {code: 'MODEL_REFUSED'});
    await assert.rejects(intent.parse({input: 'new unrelated request', baseline: {...baseline, unresolved: [baseline.unresolved[0]! + 'a']}}), resource('maxBaselineBytes', 'input'));
    assert.equal(calls(), 1);
  } finally {await intent.dispose();}
});

for (const key of ['schema', 'extensionSchema'] as const) test('SC-26 actual 262144-byte declaration boundary: ' + key, async () => {
  const schema = padded({type: 'object', properties: {[key === 'schema' ? 'x' : 'extensionValue']: {type: 'string'}}}, 'description', 262144);
  assert.equal(bytes(schema), 262144);
  const accepted = new Intent({[key]: schema}); await accepted.dispose();
  assert.throws(() => new Intent({[key]: {...schema, description: (schema as unknown as {description: string}).description + 'a'}}), resource('maxSchemaBytes', 'config'));
});

test('SC-28 full default combined material budget is measured before model generation', async () => {
  const context = padded({}, 'padding', 1048576);
  const skeleton: EffectiveIntentSnapshot = {schemaVersion: '2.0-draft.6', coverage: 'partial', scope: 'provided_materials', intents: [], constraints: [], unresolved: [''], relations: []};
  const baseline = {...skeleton, unresolved: ['a'.repeat(1048576 - bytes(skeleton))]};
  const request: IntentParseRequest = {input: 'current request', context, baseline};
  const material = {language: 'en', semantics: {description: ''}, request: {...request, fields: [], output: {suggestions: false, evidence: false, diagnostics: false, extensions: false}}};
  const description = 'a'.repeat(3145728 - bytes(material));
  const {intent, calls} = refusal({semantics: {description}});
  assert.equal(bytes({...material, semantics: {description}}), 3145728);
  try {
    await assert.rejects(intent.parse(request), {code: 'MODEL_REFUSED'});
    await assert.rejects(intent.parse({...request, input: request.input + 'a'}), resource('maxRequestBytes', 'input'));
    assert.equal(calls(), 1);
  } finally {await intent.dispose();}
});

// A real worker checks all 2^8 worlds, using the same finite binding in every
// root conditional. The 9-variable contrast requires >256 Validator calls.
for (const count of [8, 9]) test('SC-39 actual 256-call worker boundary with ' + count + ' unknown Boolean values', async () => {
  const d = draft(); d.observations = [observation('discount', 5)];
  const properties: Record<string, {type: string}> = {discount: {type: 'number'}};
  const allOf: Array<Record<string, unknown>> = [];
  for (let i = 0; i < count; i++) {
    const field = 'flag' + i; properties[field] = {type: 'boolean'};
    d.observations.push({...observation(field, undefined, 'a', 'inputs', 'present_unknown'), sources: [src]});
    allOf.push({if: {properties: {[field]: {const: true}}, required: [field]}, then: {properties: {discount: {maximum: 10}}}, else: {properties: {discount: {maximum: 20}}}});
  }
  const task: ValidationTask = {draft: d, materials: {input: 'discount=5; every flag exists but its value is undisclosed'}, schema: {type: 'object', properties, allOf} as NonNullable<ValidationTask['schema']>, selection: ['discount'], extensions: false, maxBytes: 1048576, maxSchemaBytes: 262144, maxDepth: 64, maxChecks: 256, used: 0};
  const runner = new ValidationRunner();
  try {
    if (count === 8) {const result = await runner.run(task, new AbortController().signal); assert.equal(result.values[0]!.status, 'present'); assert.equal(result.used, 256);}
    else await assert.rejects(runner.run(task, new AbortController().signal), (error: unknown) => resource('maxValidationChecks', 'validation')(error) && (error as IntentError).details?.observed === 257);
  } finally {await runner.close();}
});
