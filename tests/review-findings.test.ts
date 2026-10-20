import test from 'node:test';
import assert from 'node:assert/strict';
import {Intent, IntentError, type IntentConfig, type IntentParseRequest, type IntentResult, type JsonObject} from '../src/index.js';
import {createIntentMcpAdapter, type HostTask} from '../src/mcp/index.js';
import {createApiExecutor} from '../src/adapters/api.js';
import type {CandidateDraft, ConstraintDraft} from '../src/model/candidate.js';
import {controlled, draft, observation, retain, src} from './helpers.js';

async function parse(d: CandidateDraft, request: IntentParseRequest = {input: 'Understand the supplied requirement.'}, config: IntentConfig = {}): Promise<IntentResult> {
  const intent = new Intent({...config, executor: controlled(() => d)});
  try {return await intent.parse(request);} finally {await intent.dispose();}
}
const rejectsAt = (path: string, rule = 'SEMANTIC_INVARIANT') => (error: unknown): boolean => {
  assert(error instanceof IntentError); assert.equal(error.code, 'MODEL_OUTPUT_INVALID'); assert.equal(error.stage, 'validation');
  assert.deepEqual(error.details?.violations, [{path, rule}]); return true;
};
const constraint = (key: string, ownerKey: string | null = null, scope: ConstraintDraft['scope'] = 'global'): ConstraintDraft => ({key, priorRef: null, ownerKey, scope, referenceKey: null, kind: 'precondition', text: 'Only if the review fails.', expressionJson: null, sources: [src]});
function proseSchema(position: string, annotation: string): JsonObject {
  const rule: JsonObject = position === 'field' ? {properties: {x: {type: 'string', [annotation]: 'Satisfy the supplied business relation.'}}}
    : {[annotation]: 'x must satisfy the supplied business relation.', properties: {x: {type: 'string'}}};
  return {type: 'object', properties: {x: {type: 'string'}, flag: {}}, ...(position === 'ref'
    ? {definitions: {dependent: rule}, dependencies: {flag: {$ref: '#/definitions/dependent'}}}
    : {dependencies: {flag: rule}})};
}

for (const position of ['root', 'field', 'ref']) for (const annotation of ['description', '_description']) for (const verdict of ['missing', 'unknown', 'invalid', 'valid'] as const) {
  test(`Dependency prose ${position}/${annotation}/${verdict} uses the shared semantic gate`, async () => {
    const d = draft(), value = observation('x', 'sample'); d.observations = [value, observation('flag', true)];
    if (verdict !== 'missing') value.semantic = {status: verdict, explanation: 'The supplied facts establish this semantic verdict.', sources: [src], dependencies: []};
    const result = await parse(d, {input: 'Use sample with the flag present.', fields: ['x']}, {schema: proseSchema(position, annotation)});
    const expected = verdict === 'valid' ? 'present' : verdict === 'invalid' ? 'invalid' : 'unknown';
    assert.equal(result.fieldResults[0]!.status, expected);
    assert.equal(Object.hasOwn(result.effective.intents[0]!.inputs, 'x'), expected === 'present');
  });
}
for (const value of [false, 0, null, '']) test('A present dependency is triggered even for ' + JSON.stringify(value), async () => {
  const d = draft(); d.observations = [observation('x', 'sample'), observation('flag', value)];
  const r = await parse(d, {input: 'The flag is explicitly present.', fields: ['x']}, {schema: proseSchema('root', 'description')});
  assert.equal(r.fieldResults[0]!.status, 'unknown'); assert.equal(Object.hasOwn(r.effective.intents[0]!.inputs, 'x'), false);
});
for (const presence of ['absent', 'unknown', 'present_unknown', 'not_provided'] as const) test('Dependency prose distinguishes existence knowledge: ' + presence, async () => {
  const d = draft(), flag = observation('flag', null, 'a', 'inputs', presence);
  if (presence === 'present_unknown') flag.sources = [src];
  d.observations = [observation('x', 'sample'), flag];
  const r = await parse(d, {input: 'Use sample; retain the supplied knowledge about the flag.', fields: ['x']}, {schema: proseSchema('field', '_description')});
  assert.equal(r.fieldResults[0]!.status, presence === 'absent' ? 'present' : 'unknown');
});
for (const array of [false, true]) for (const active of [false, true]) test(`Nested shared ref preserves dependency applicability, array=${array}, active=${active}`, async () => {
  const members = [{}, active ? {flag: false} : {}], d = draft();
  const schema: JsonObject = {type: 'object', properties: {x: array ? {type: 'array', items: {$ref: '#/definitions/item'}}
    : {type: 'object', properties: {first: {$ref: '#/definitions/item'}, second: {$ref: '#/definitions/item'}}}},
    definitions: {item: {type: 'object', properties: {flag: {}}, dependencies: {flag: {_description: 'The related object must satisfy the stated relation.'}}}}};
  d.observations = [observation('x', array ? members : {first: members[0], second: members[1]})];
  const r = await parse(d, {input: 'Use the explicitly supplied objects.', fields: ['x']}, {schema});
  assert.equal(r.fieldResults[0]!.status, active ? 'unknown' : 'present');
});
test('Property dependency arrays and unused definitions do not invent a prose requirement', async () => {
  const d = draft(); d.observations = [observation('x', 'sample'), observation('flag', false)];
  const r = await parse(d, {input: 'Use sample and flag=false.', fields: ['x']}, {schema: {type: 'object', properties: {x: {type: 'string'}, flag: {}}, dependencies: {x: ['flag']}, definitions: {unused: {description: 'An unrelated rule.'}}}});
  assert.equal(r.fieldResults[0]!.status, 'present'); assert.deepEqual(r.effective.intents[0]!.inputs, {x: 'sample'});
});
test('An inactive dependency cannot disguise an unproved formal claim on an unselected field', async () => {
  const d = draft(); d.observations = [observation('x', 'sample'), observation('flag', null, 'a', 'inputs', 'absent')];
  d.issues = [{key: 'invalid', ownerKey: 'a', fieldTarget: {container: 'inputs', field: 'x', path: '/x'}, code: 'FIELD_VALUE_INVALID', category: 'data', message: 'The unselected value is claimed invalid without a proof.', sources: [src], candidates: [], questions: []}];
  await assert.rejects(parse(d, {input: 'The flag is known absent.', fields: []}, {schema: proseSchema('root', 'description')}), rejectsAt('/issues/0/code'));
});

function unresolved(): CandidateDraft {
  const d = draft([]); d.kind = 'amendment';
  d.changes = [{operation: 'withdraw', effect: 'unresolved', targetKind: 'unresolved', targetKey: null, conditionKey: null, description: 'Withdraw the unspecified earlier goal if the review fails.', sources: [src], deltaHints: []}];
  return d;
}
function retiredCondition(): CandidateDraft {
  const d = unresolved(); d.usedHistory = true; d.priorTargets = [{kind: 'constraint', key: 'retired', priorRef: {root: 'context', pointer: '/oldCondition'}}]; d.changes[0]!.conditionKey = 'retired'; return d;
}
const conditionRequest = {input: 'Withdraw the earlier goal if review fails.', context: {oldCondition: {id: 'retired-condition', scope: {type: 'global'}, text: 'Review fails.'}}};
test('An unresolved change cannot reference a retired-only condition', async () => {
  await assert.rejects(parse(retiredCondition(), conditionRequest), rejectsAt('/changes/0/conditionKey', 'REFERENCE_NOT_FOUND'));
});
for (const local of [false, true]) test('An unresolved change can reference a current ' + (local ? 'node' : 'global') + ' condition', async () => {
  const d = local ? draft() : draft([]); d.kind = 'amendment'; d.constraints = [constraint('current', local ? 'a' : null, local ? 'intent' : 'global')];
  d.changes.push({...unresolved().changes[0]!, conditionKey: 'current'});
  const r = await parse(d); const c = local ? r.effective.intents[0]!.constraints[0]! : r.effective.constraints[0]!;
  assert.equal(r.turn.changes.at(-1)!.conditionId, c.id);
});
test('Unresolved changes without a condition remain legitimate', async () => {
  const r = await parse(unresolved()); assert.equal(r.status, 'partial'); assert.equal(Object.hasOwn(r.turn.changes[0]!, 'conditionId'), false);
});

for (const operation of ['modify', 'withdraw'] as const) {
  for (const key of ['', ' ', 'missing']) test(`Unresolved ${operation} rejects the supplied condition key ${JSON.stringify(key)}`, async () => {
    const d = unresolved(); d.changes[0]!.operation = operation; d.changes[0]!.conditionKey = key;
    await assert.rejects(parse(d), rejectsAt('/changes/0/conditionKey', 'REFERENCE_NOT_FOUND'));
  });
  for (const current of [false, true]) test(`Unresolved ${operation} preserves ${current ? 'a current condition' : 'an explicit null condition'}`, async () => {
    const d = unresolved(); d.changes[0]!.operation = operation;
    if (current) {d.constraints = [constraint('c')]; d.changes[0]!.conditionKey = 'c';}
    const r = await parse(d);
    assert.equal(Object.hasOwn(r.turn.changes[0]!, 'conditionId'), current);
    if (current) assert.equal(r.turn.changes[0]!.conditionId, r.effective.constraints[0]!.id);
  });
}

for (const operation of ['modify', 'withdraw'] as const) for (const current of [false, true]) test(`MCP corrects an empty ${operation} condition to ${current ? 'a current key' : 'null'} within the same request`, async () => {
  const d = unresolved(); d.changes[0]!.operation = operation; d.changes[0]!.conditionKey = '';
  const intent = new Intent({}), adapter = createIntentMcpAdapter({mode: 'host', instances: {main: intent}}), session = adapter.connect({protocolVersion: '2025-11-25'});
  try {
    const prepared = await session.callTool('intent_runtime_prepare', {input: 'Affect the unspecified prior goal under the supplied condition.'});
    assert.equal(prepared!.isError, false); const task = prepared!.structuredContent as unknown as HostTask;
    const submit = () => session.callTool('intent_runtime_accept', {requestId: task.requestId, submissionToken: task.submissionToken, candidateText: JSON.stringify(d)});
    const bad = await submit(); assert.equal(bad!.isError, true);
    const error = JSON.parse(bad!.content[0]!.text).error;
    assert.equal(error.code, 'MODEL_OUTPUT_INVALID'); assert.deepEqual(error.details.violations, [{path: '/changes/0/conditionKey', rule: 'REFERENCE_NOT_FOUND'}]);
    d.changes[0]!.conditionKey = current ? 'c' : null;
    if (current) d.constraints = [constraint('c')];
    const good = await submit(); assert.equal(good!.isError, false, good!.content[0]!.text);
    const r = good!.structuredContent as unknown as IntentResult;
    assert.equal(r.turn.changes[0]!.target.kind, 'unresolved'); assert.equal(Object.hasOwn(r.turn.changes[0]!, 'conditionId'), current);
    if (current) assert.equal(r.turn.changes[0]!.conditionId, r.effective.constraints[0]!.id);
  } finally {await adapter.close(); await intent.dispose();}
});

test('Deltas describe actual baseline differences while preserving null and array removal', async t => {
  let d = draft(); d.nodes[0]!.expectedOutput = ['a', 'b', 'c']; const intent = new Intent({executor: controlled(() => d)});
  try {
    const baseline = (await intent.parse({input: 'Keep the goal and three deliverables.'})).effective;
    for (const name of ['missing-remove', 'same-set', 'real-set', 'real-remove', 'array-shift', 'null-set', 'no-hint'] as const) await t.test(name, async () => {
      d = retain(draft()); d.nodes[0]!.expectedOutput = ['a', 'b', 'c'];
      if (name === 'missing-remove') d.changes[0]!.deltaHints = [{path: '/neverExisted', operation: 'remove'}];
      if (name === 'same-set') d.changes[0]!.deltaHints = [{path: '/goal', operation: 'set'}];
      if (name === 'real-set') {d.nodes[0]!.goal = 'The revised goal'; d.changes[0]!.deltaHints = [{path: '/goal', operation: 'set'}];}
      if (name === 'real-remove') {d.nodes[0]!.expectedOutput = []; d.changes[0]!.deltaHints = [{path: '/expectedOutput', operation: 'remove'}];}
      if (name === 'array-shift') {d.nodes[0]!.expectedOutput = ['b', 'c']; d.changes[0]!.deltaHints = [{path: '/expectedOutput/0', operation: 'remove'}];}
      if (name === 'null-set') {d.nodes[0]!.target = null; d.changes[0]!.deltaHints = [{path: '/target', operation: 'set'}];}
      const request = {input: 'Apply the explicit interpretation update.', baseline};
      if (name === 'same-set' || name === 'missing-remove') await assert.rejects(intent.parse(request), rejectsAt('/changes/0/deltaHints/0/path'));
      else {const r = await intent.parse(request), delta = r.turn.changes[0]!.deltas?.[0];
        if (name === 'no-hint') assert.equal(delta, undefined);
        else {assert(delta); if (name === 'null-set') {assert.equal(delta.operation, 'set'); assert.equal(delta.after, null);} else assert.equal(delta.operation, name === 'real-set' ? 'set' : 'remove');}
      }
    });
  } finally {await intent.dispose();}
});
test('Object key order is not an actual delta', async () => {
  let d = draft(); d.observations = [observation('meta', {a: 1, b: 2})];
  const intent = new Intent({schema: {type: 'object', properties: {meta: {type: 'object', properties: {a: {type: 'number'}, b: {type: 'number'}}}}}, executor: controlled(() => d)});
  try {const baseline = (await intent.parse({input: 'Use a=1,b=2.', fields: ['meta']})).effective;
    d = retain(draft()); d.observations = [observation('meta', {b: 2, a: 1})]; d.changes[0]!.deltaHints = [{path: '/inputs/meta', operation: 'set'}];
    await assert.rejects(intent.parse({input: 'The same object in another key order.', baseline, fields: ['meta']}), rejectsAt('/changes/0/deltaHints/0/path'));
  } finally {await intent.dispose();}
});
for (const operation of ['remove', 'set'] as const) test('Partial Context absence remains unknown for ' + operation, async () => {
  const d = retain(draft()); d.nodes[0]!.priorRef = {root: 'context', pointer: '/old'};
  d.changes[0]!.deltaHints = [{path: operation === 'remove' ? '/unprovided' : '/goal', operation}];
  const r = await parse(d, {input: 'Apply the supplied update.', context: {old: {id: 'prior-goal'}}});
  assert.equal(r.turn.changes[0]!.deltas![0]!.operation, operation); assert.equal(Object.hasOwn(r.turn.changes[0]!.deltas![0]!, 'before'), false);
});
test('An explicitly known identical Context value is still a no-op', async () => {
  const d = retain(draft()); d.nodes[0]!.priorRef = {root: 'context', pointer: '/old'}; d.changes[0]!.deltaHints = [{path: '/goal', operation: 'set'}];
  await assert.rejects(parse(d, {input: 'Keep this same value.', context: {old: {id: 'prior-goal', goal: d.nodes[0]!.goal}}}), rejectsAt('/changes/0/deltaHints/0/path'));
});
test('Empty withdrawal is rejected while other empty turn kinds remain valid', async () => {
  const d = draft([]); d.kind = 'withdrawal'; await assert.rejects(parse(d), rejectsAt('/kind'));
  d.kind = 'statement'; assert.equal((await parse(d)).turn.kind, 'statement');
});
test('A withdrawal with an unresolved target remains partial without inventing an ID', async () => {
  const d = unresolved(); d.kind = 'withdrawal'; d.historyCoverage = 'unavailable'; const r = await parse(d);
  assert.equal(r.status, 'partial'); assert.equal(r.turn.changes[0]!.target.kind, 'unresolved');
});
test('Global owner contradictions are rejected instead of silently discarded', async () => {
  const d = draft(); d.constraints = [constraint('c', 'a')]; await assert.rejects(parse(d), rejectsAt('/constraints/0/ownerKey'));
  d.constraints[0]!.ownerKey = null; assert.equal((await parse(d)).effective.constraints[0]!.scope.type, 'global');
});
for (const scope of ['intent', 'phase'] as const) test('Existing local constraint ownership remains valid: ' + scope, async () => {
  const d = draft(); d.constraints = [constraint('c', 'a', scope)]; assert.equal((await parse(d)).effective.intents[0]!.constraints[0]!.scope.type, scope);
});

for (const finding of ['condition', 'delta', 'withdrawal', 'owner'] as const) test('MCP host returns an exact correction path and accepts a correction: ' + finding, async () => {
  const d = finding === 'condition' ? retiredCondition() : finding === 'withdrawal' ? draft([]) : draft();
  const request: IntentParseRequest = finding === 'condition' ? conditionRequest : {input: 'Understand the explicit requirement.'};
  if (finding === 'withdrawal') d.kind = 'withdrawal';
  if (finding === 'owner') d.constraints = [constraint('c', 'a')];
  if (finding === 'delta') {const baseline = (await parse(draft())).effective; Object.assign(request, {baseline}); retain(d); d.changes[0]!.deltaHints = [{path: '/goal', operation: 'set'}];}
  const paths = {condition: '/changes/0/conditionKey', delta: '/changes/0/deltaHints/0/path', withdrawal: '/kind', owner: '/constraints/0/ownerKey'};
  const intent = new Intent({}), adapter = createIntentMcpAdapter({mode: 'host', instances: {main: intent}}), session = adapter.connect({protocolVersion: '2025-11-25'});
  try {
    const taskResult = await session.callTool('intent_runtime_prepare', request); assert.equal(taskResult!.isError, false);
    const task = taskResult!.structuredContent as unknown as HostTask;
    const submit = () => session.callTool('intent_runtime_accept', {requestId: task.requestId, submissionToken: task.submissionToken, candidateText: JSON.stringify(d)});
    const bad = await submit(); assert.equal(bad!.isError, true); const error = JSON.parse(bad!.content[0]!.text).error;
    assert.equal(error.code, 'MODEL_OUTPUT_INVALID'); assert.equal(error.details.violations[0].path, paths[finding]);
    if (finding === 'condition') {d.constraints = [constraint('current')]; d.changes[0]!.conditionKey = 'current';}
    if (finding === 'delta') d.nodes[0]!.goal = 'The explicitly revised goal';
    if (finding === 'withdrawal') {d.changes = unresolved().changes; d.historyCoverage = 'unavailable';}
    if (finding === 'owner') d.constraints[0]!.ownerKey = null;
    const good = await submit(); assert.equal(good!.isError, false, good!.content[0]!.text);
    const result = good!.structuredContent as unknown as IntentResult;
    if (finding === 'condition') assert.equal(result.turn.changes[0]!.conditionId, result.effective.constraints[0]!.id);
    if (finding === 'withdrawal') assert.equal(result.turn.changes[0]!.target.kind, 'unresolved');
  } finally {await adapter.close(); await intent.dispose();}
});
test('MCP host uses the same dependency prose gate without a model API call', async () => {
  const intent = new Intent({schema: proseSchema('ref', '_description')}), adapter = createIntentMcpAdapter({mode: 'host', instances: {main: intent}}), session = adapter.connect({protocolVersion: '2025-11-25'});
  try {
    for (const valid of [false, true]) {
      const d = draft(), x = observation('x', 'sample'); d.observations = [x, observation('flag', false)];
      if (valid) x.semantic = {status: 'valid', explanation: 'The supplied facts satisfy the applicable relation.', sources: [src], dependencies: []};
      const prepared = await session.callTool('intent_runtime_prepare', {input: 'Use sample, flag=false.', fields: ['x'], output: {diagnostics: true}});
      assert.equal(prepared!.isError, false); const task = prepared!.structuredContent as unknown as HostTask;
      const accepted = await session.callTool('intent_runtime_accept', {requestId: task.requestId, submissionToken: task.submissionToken, candidateText: JSON.stringify(d)});
      assert.equal(accepted!.isError, false, accepted!.content[0]!.text); const result = accepted!.structuredContent as unknown as IntentResult;
      assert.equal(result.fieldResults[0]!.status, valid ? 'present' : 'unknown'); assert.equal(result.diagnostics!.modelCallCount, 0);
    }
  } finally {await adapter.close(); await intent.dispose();}
});
test('API executor propagates the shared-core reference error after one controlled response', async t => {
  let calls = 0; t.mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {assert.equal(String(url), 'https://intent-runtime-fixture.invalid/v1/chat/completions'); calls++; return new Response(JSON.stringify({choices: [{finish_reason: 'stop', message: {role: 'assistant', content: JSON.stringify(retiredCondition())}}]}), {headers: {'content-type': 'application/json'}});});
  const intent = new Intent({executor: createApiExecutor({provider: 'openai', protocol: 'chat-completions', format: 'text', model: 'controlled-fixture', apiKey: 'controlled-fixture', baseURL: 'https://intent-runtime-fixture.invalid/v1'})});
  try {await assert.rejects(intent.parse(conditionRequest), rejectsAt('/changes/0/conditionKey', 'REFERENCE_NOT_FOUND')); assert.equal(calls, 1);} finally {await intent.dispose();}
});
