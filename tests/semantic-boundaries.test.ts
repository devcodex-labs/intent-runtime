import test from 'node:test';
import assert from 'node:assert/strict';
import {Intent} from '../src/index.js';
import type {IntentResult} from '../src/index.js';
import {createIntentMcpAdapter, type HostTask} from '../src/mcp/index.js';
import {controlled, draft, src, observation, retain} from './helpers.js';

test('Host correction locates the invalid effect without inventing a missing withdrawal target', async () => {
  const d = draft(); d.kind = 'amendment'; d.historyCoverage = 'unavailable';
  d.normalizedInput = 'Withdraw the earlier requirement only if review fails; neither that requirement nor the review result is supplied.';
  d.nodes[0]!.target = null; d.nodes[0]!.understanding = 'incomplete'; d.nodes[0]!.goal = d.normalizedInput;
  d.constraints = [{key: 'condition', priorRef: null, ownerKey: 'a', scope: 'intent', referenceKey: null, kind: 'requirement', text: d.normalizedInput, expressionJson: null, sources: [src]}];
  d.changes.push({operation: 'withdraw', effect: 'conditional', targetKind: 'unresolved', targetKey: null, conditionKey: 'condition', description: 'The earlier requirement is not supplied; withdrawal remains conditional on review failure.', sources: [src], deltaHints: []});
  d.references = [{key: 'earlier', ownerKey: 'a', priorRef: null, kind: 'source', intentKey: null, entityRef: null, resolved: false, description: 'The earlier requirement is not supplied', sources: [src]}];
  let modelCalls = 0;
  const intent = new Intent({executor: {id: 'must-not-run', async generate() {modelCalls++; throw new Error('Unexpected executor call');}}});
  const adapter = createIntentMcpAdapter({mode: 'host', instances: {main: intent}}), session = adapter.connect({protocolVersion: '2025-06-18'});
  try {
    const prepared = await session.callTool('intent_runtime_prepare', {input: d.normalizedInput, output: {diagnostics: true}});
    assert.equal(prepared!.isError, false);
    const task = prepared!.structuredContent as unknown as HostTask;
    const submit = () => session.callTool('intent_runtime_accept', {requestId: task.requestId, submissionToken: task.submissionToken, candidateText: JSON.stringify(d)});
    const bad = await submit(); assert.equal(bad!.isError, true);
    const error = JSON.parse(bad!.content[0]!.text).error;
    assert.equal(error.code, 'MODEL_OUTPUT_INVALID');
    assert.deepEqual(error.details.violations, [{rule: 'SEMANTIC_INVARIANT', path: '/changes/1/effect'}]);
    d.changes[1]!.effect = 'unresolved';
    const accepted = await submit(); assert.equal(accepted!.isError, false, accepted!.content[0]!.text);
    const result = accepted!.structuredContent as unknown as IntentResult;
    assert.equal(result.status, 'partial'); assert.equal(result.turn.kind, 'amendment');
    const withdrawal = result.turn.changes.find(c => c.operation === 'withdraw')!;
    assert.equal(withdrawal.target.kind, 'unresolved'); assert.equal(withdrawal.effect, 'unresolved');
    assert.equal(withdrawal.conditionId, result.effective.intents[0]!.constraints[0]!.id);
    assert.equal(result.effective.intents[0]!.target, null);
    assert(result.issues.some(q => q.code === 'AMBIGUOUS_REFERENCE'));
    assert.equal(result.diagnostics!.modelCallCount, 0); assert.equal(modelCalls, 0);
  } finally {await adapter.close(); await intent.dispose();}
});

test('A conditional withdrawal of a supplied goal retains its identity and condition', async () => {
  let d = draft(); d.nodes[0]!.goal = 'Retain the notification requirement';
  const intent = new Intent({executor: controlled(() => d)});
  try {
    const first = await intent.parse({input: 'Keep the notification requirement'});
    d = retain(draft()); d.nodes[0]!.goal = first.effective.intents[0]!.goal;
    d.constraints = [{key: 'condition', priorRef: null, ownerKey: 'a', scope: 'intent', referenceKey: null, kind: 'requirement', text: 'Withdraw notifications only if the security test fails; otherwise retain them', expressionJson: null, sources: [src]}];
    d.changes = [{operation: 'add', effect: 'applied', targetKind: 'constraint', targetKey: 'condition', conditionKey: null, description: 'Add the current conditional requirement', sources: [src], deltaHints: []}, {operation: 'withdraw', effect: 'conditional', targetKind: 'intent', targetKey: 'a', conditionKey: 'condition', description: 'Withdraw notifications only if the security test fails', sources: [src], deltaHints: []}];
    const result = await intent.parse({input: 'Withdraw notifications only if the security test fails; the result is not supplied', baseline: first.effective});
    assert.equal(result.effective.intents[0]!.id, first.effective.intents[0]!.id);
    const change = result.turn.changes.find(c => c.operation === 'withdraw')!;
    assert.deepEqual(change.target, {kind: 'intent', id: first.effective.intents[0]!.id});
    assert.equal(change.effect, 'conditional'); assert.equal(change.conditionId, result.effective.intents[0]!.constraints[0]!.id);
    assert.equal(change.deltas, undefined); assert.equal(result.status, 'complete');
  } finally {await intent.dispose();}
});

test('Business independence and explicit request order survive together without a parent goal', async () => {
  const d = draft(['email', 'sms']);
  d.normalizedInput = 'Query email login records, then SMS login records; the two queries are independent.';
  d.nodes[0]!.goal = 'Query email login records'; d.nodes[1]!.goal = 'Query SMS login records';
  d.relations = [{key: 'order', priorRef: null, fromKey: 'email', toKey: 'sms', kind: 'before', condition: null, sources: [src]}];
  d.constraints = [{key: 'independent', priorRef: null, ownerKey: null, scope: 'global', referenceKey: null, kind: 'requirement', text: 'The two queries are independent; email is requested before SMS', expressionJson: null, sources: [src]}];
  const intent = new Intent({executor: controlled(() => d)});
  try {
    const result = await intent.parse({input: d.normalizedInput});
    assert.equal(result.effective.intents.length, 2); assert(result.effective.intents.every(n => n.children.length === 0));
    assert.equal(result.effective.relations[0]!.kind, 'before');
    assert.equal(result.effective.relations[0]!.fromId, result.effective.intents[0]!.id);
    assert.equal(result.effective.relations[0]!.toId, result.effective.intents[1]!.id);
    assert.equal(result.effective.constraints[0]!.text, d.constraints[0]!.text); assert.equal(result.status, 'complete');
  } finally {await intent.dispose();}
});

test('Normalization explains a same-utterance correction while effective contains only the final goal', async () => {
  const d = draft(); d.normalizedInput = '用户当场将短信登录表述修正为邮箱登录，当前请求为增加邮箱登录。';
  d.nodes[0]!.goal = '增加邮箱登录'; d.nodes[0]!.target = '邮箱登录'; d.nodes[0]!.action = 'add';
  const intent = new Intent({executor: controlled(() => d)});
  try {
    const result = await intent.parse({input: '增加短信登录，算了，改成邮箱登录。'});
    assert.equal(result.turn.normalizedInput, d.normalizedInput);
    assert.equal(result.effective.intents.length, 1); assert.equal(result.effective.intents[0]!.goal, '增加邮箱登录');
    assert.deepEqual(result.turn.changes.map(c => [c.operation, c.effect, c.target.kind]), [['add', 'applied', 'intent']]);
    assert.equal(result.effective.relations.length, 0);
  } finally {await intent.dispose();}
});

for (const presence of ['not_provided', 'absent'] as const) test('Missing material or known physical absence never means parameter withdrawal: ' + presence, async () => {
  const d = draft(); d.observations = [observation('productId', undefined, 'a', 'inputs', presence)];
  const intent = new Intent({schema: {type: 'object', properties: {productId: {type: 'string', default: 'SAMPLE'}}, required: ['productId']}, executor: controlled(() => d)});
  try {
    const result = await intent.parse({input: presence === 'absent' ? 'Create an order; productId does not exist' : 'Create an order; productId was not supplied', fields: ['productId']});
    assert.deepEqual(result.effective.intents[0]!.inputs, {});
    assert.equal(result.fieldResults[0]!.status, 'not_provided');
    assert(result.issues.some(q => q.code === 'FIELD_REQUIRED_MISSING'));
    assert.equal(result.effective.intents[0]!.understanding, 'clear');
  } finally {await intent.dispose();}
});

test('Explicit parameter withdrawal works with fields empty and does not force required re-extraction', async () => {
  let d = draft(); d.observations = [observation('productId', 'P7')];
  const intent = new Intent({schema: {type: 'object', properties: {productId: {type: 'string'}}, required: ['productId']}, executor: controlled(() => d)});
  try {
    const first = await intent.parse({input: 'Create an order for product P7', fields: ['productId']});
    d = retain(draft()); d.observations = [observation('productId', undefined, 'a', 'inputs', 'unknown', true)];
    d.changes[0]!.deltaHints = [{operation: 'remove', path: '/inputs/productId'}];
    const next = await intent.parse({input: 'Withdraw the productId parameter requirement, leaving the order goal', fields: [], baseline: first.effective});
    assert.equal(next.effective.intents[0]!.id, first.effective.intents[0]!.id);
    assert.deepEqual(next.effective.intents[0]!.inputs, {});
    assert.equal(next.fieldResults[0]!.status, 'removed');
    assert.equal(next.fieldResults[0]!.trigger, 'invalidation');
    assert(!next.issues.some(q => q.code === 'FIELD_REQUIRED_MISSING'));
  } finally {await intent.dispose();}
});

for (const presence of ['withdrawn', 'absent'] as const) test('Withdrawing a binding does not assert physical dependency absence: ' + presence, async () => {
  let d = draft(); d.observations = [observation('isVip', true), observation('discount', 15)];
  const schema = {type: 'object', properties: {isVip: {type: 'boolean'}, discount: {type: 'number'}}, if: {properties: {isVip: {const: true}}, required: ['isVip']}, then: {properties: {discount: {maximum: 20}}}, else: {properties: {discount: {maximum: 10}}}};
  const intent = new Intent({schema, executor: controlled(() => d)});
  try {
    const first = await intent.parse({input: 'Set isVip true and discount15', fields: ['isVip', 'discount']});
    d = retain(draft()); d.observations = [observation('isVip', undefined, 'a', 'inputs', presence === 'withdrawn' ? 'unknown' : presence, presence === 'withdrawn')];
    const result = await intent.parse({input: presence === 'withdrawn' ? 'Withdraw the isVip parameter requirement; no physical VIP status supplied' : 'The isVip property physically no longer exists', fields: ['isVip'], baseline: first.effective});
    assert.deepEqual(result.effective.intents[0]!.inputs, {});
    assert.equal(result.fieldResults.find(q => q.field === 'isVip')!.status, presence === 'withdrawn' ? 'removed' : 'not_provided');
    assert.equal(result.fieldResults.find(q => q.field === 'discount')!.status, presence === 'withdrawn' ? 'unknown' : 'invalidated');
    assert(result.issues.some(q => q.field === 'discount' && q.code === (presence === 'withdrawn' ? 'FIELD_DEPENDENCY_MISSING' : 'FIELD_INVALIDATED')));
  } finally {await intent.dispose();}
});

test('A Context-only absence cannot be presented as a current parameter withdrawal', async () => {
  const d = draft(); d.usedHistory = true;
  d.observations = [{...observation('x', undefined, 'a', 'inputs', 'not_provided', true), sources: [{root: 'context', pointer: '/fact'}]}];
  const intent = new Intent({schema: {type: 'object', properties: {x: {type: 'number'}}}, executor: controlled(() => d)});
  try {
    await assert.rejects(intent.parse({input: 'Keep the goal', fields: ['x'], context: {fact: 'x does not exist'}}), (error: unknown) => {
      const e = error as {code: string; details: {violations: Array<{path: string}>}};
      assert.equal(e.code, 'MODEL_OUTPUT_INVALID');
      assert.equal(e.details.violations[0]!.path, '/observations/0/sources'); return true;
    });
  } finally {await intent.dispose();}
});

test('A retired parameter may still have a supplied physical fact used by a dependent field', async () => {
  let d = draft(); d.observations = [observation('isVip', true), observation('discount', 15)];
  const schema = {type: 'object', properties: {isVip: {type: 'boolean'}, discount: {type: 'number'}}, if: {properties: {isVip: {const: true}}, required: ['isVip']}, then: {properties: {discount: {maximum: 20}}}, else: {properties: {discount: {maximum: 10}}}};
  const intent = new Intent({schema, executor: controlled(() => d)});
  try {
    const first = await intent.parse({input: 'Set isVip true and discount15', fields: ['isVip', 'discount']});
    d = retain(draft());
    d.observations = [{...observation('isVip', true, 'a', 'inputs', 'known', true), sources: [src, {root: 'context', pointer: '/physicalVip'}]}];
    const result = await intent.parse({input: 'Withdraw only the isVip parameter requirement; physical VIP status is explicitly supplied separately', fields: [], baseline: first.effective, context: {physicalVip: true}});
    assert.deepEqual(result.effective.intents[0]!.inputs, {discount: 15});
    assert.equal(result.fieldResults.find(q => q.field === 'isVip')!.status, 'removed');
    assert.equal(result.fieldResults.find(q => q.field === 'discount')!.status, 'present');
    assert.equal(result.fieldResults.find(q => q.field === 'discount')!.trigger, 'invalidation');
    assert.deepEqual(result.issues, []);
  } finally {await intent.dispose();}
});

// Controlled candidates isolate language generation only. These assertions
// exercise the real core's ownership, identities, changes and issue assembly;
// actual model recognition is verified separately through Codex CLI.
test('Explicit composite containment keeps one shared authority through child withdrawal', async () => {
  let d = draft(['center', 'email', 'sms']);
  d.nodes[0]!.goal = '会员中心支持邮箱和短信登录';
  d.nodes[1]!.parentKey = 'center'; d.nodes[1]!.goal = '邮箱登录';
  d.nodes[2]!.parentKey = 'center'; d.nodes[2]!.goal = '短信登录';
  d.constraints = [{key: 'no-table', priorRef: null, ownerKey: 'center', scope: 'intent', referenceKey: null, kind: 'prohibition', text: '两个登录子功能都不得新增数据表', expressionJson: null, sources: [src]}];
  const intent = new Intent({executor: controlled(() => d)});
  try {
    const first = await intent.parse({input: '会员中心要有邮箱登录和短信登录，都不得新增数据表'});
    const parent = first.effective.intents[0]!;
    assert.equal(first.effective.intents.length, 1);
    assert.equal(parent.children.length, 2);
    assert.equal(parent.constraints.length, 1);
    assert(parent.children.every(n => n.constraints.length === 0));
    assert.deepEqual(first.effective.relations, []);
    d.nodes = d.nodes.slice(0, 2);
    d.nodes[0]!.goal = '会员中心支持邮箱登录';
    d.nodes[0]!.priorRef = {root: 'baseline', pointer: '/intents/0'};
    d.nodes[1]!.priorRef = {root: 'baseline', pointer: '/intents/0/children/0'};
    d.constraints[0]!.priorRef = {root: 'baseline', pointer: '/intents/0/constraints/0'};
    d.kind = 'withdrawal'; d.usedHistory = true; d.relatedKeys = ['center', 'email'];
    d.priorTargets = [{kind: 'intent', key: 'sms', priorRef: {root: 'baseline', pointer: '/intents/0/children/1'}}];
    d.changes = [{operation: 'withdraw', effect: 'applied', targetKind: 'intent', targetKey: 'sms', conditionKey: null, description: '只撤回短信登录需求', sources: [src], deltaHints: []}];
    const next = await intent.parse({input: '撤回短信登录，邮箱登录和其他要求保留', baseline: first.effective});
    assert.equal(next.turn.kind, 'withdrawal');
    assert.equal(next.effective.intents[0]!.id, parent.id);
    assert.equal(next.effective.intents[0]!.children[0]!.id, parent.children[0]!.id);
    assert.deepEqual(next.effective.intents[0]!.constraints, parent.constraints);
    assert.deepEqual(next.turn.changes[0]!.target, {kind: 'intent', id: parent.children[1]!.id});
    assert(!next.turn.intentIds.includes(parent.children[1]!.id));
  } finally {await intent.dispose();}
});

test('Missing prior withdrawal remains partial withdrawal with its deployed-work protection', async () => {
  const d = draft(); d.kind = 'withdrawal'; d.historyCoverage = 'unavailable';
  d.nodes[0]!.target = null; d.nodes[0]!.understanding = 'incomplete';
  d.nodes[0]!.goal = 'Withdraw the earlier requirement without rolling back deployed work';
  d.changes.push({operation: 'withdraw', effect: 'unresolved', targetKind: 'unresolved', targetKey: null, conditionKey: null, description: 'The earlier requirement was not supplied', sources: [src], deltaHints: []});
  d.constraints = [{key: 'no-rollback', priorRef: null, ownerKey: 'a', scope: 'intent', referenceKey: null, kind: 'prohibition', text: 'Do not undo deployed work', expressionJson: null, sources: [src]}];
  d.issues = [{key: 'missing', ownerKey: 'a', fieldTarget: null, code: 'CONTEXT_INCOMPLETE', category: 'context', message: 'The earlier requirement was not supplied', sources: [src], candidates: [], questions: []}];
  const intent = new Intent({executor: controlled(() => d)});
  try {
    const result = await intent.parse({input: 'Withdraw the earlier requirement without undoing deployed work'});
    assert.equal(result.turn.kind, 'withdrawal'); assert.equal(result.status, 'partial');
    assert.equal(result.effective.intents[0]!.target, null);
    assert.equal(result.effective.intents[0]!.constraints[0]!.text, 'Do not undo deployed work');
    assert(result.turn.changes.some(c => c.operation === 'withdraw' && c.effect === 'unresolved'));
    assert(result.issues.some(q => q.code === 'CONTEXT_INCOMPLETE'));
  } finally {await intent.dispose();}
});

test('Same-object conflicting materials keep conflict across JSON key reordering', async () => {
  const d = draft(); d.usedHistory = true; d.historyCoverage = 'partial';
  d.nodes[0]!.understanding = 'conflicted'; d.nodes[0]!.goal = 'Retain the current report requirement; its language is unresolved';
  d.issues = [{key: 'language', ownerKey: 'a', fieldTarget: null, code: 'CONTEXT_CONFLICT', category: 'conflict', message: 'The same report has incompatible language requirements without precedence', sources: [{root: 'context', pointer: '/firstEntry'}, {root: 'context', pointer: '/secondEntry'}], candidates: [], questions: []}];
  const intent = new Intent({executor: controlled(() => d)});
  try {
    const firstEntry = {task: 'the same report', language: 'English'}, secondEntry = {task: 'the same report', language: 'Chinese'};
    for (const context of [{firstEntry, secondEntry}, {secondEntry, firstEntry}]) {
      const result = await intent.parse({input: 'Keep the current report requirements', context});
      assert.equal(result.status, 'partial');
      assert.equal(result.effective.intents[0]!.understanding, 'conflicted');
      assert.deepEqual(result.issues.map(q => q.code), ['CONTEXT_CONFLICT']);
      assert.equal(result.effective.intents[0]!.expectedOutput, undefined);
    }
  } finally {await intent.dispose();}
});

test('Ambiguous delivery action retains its precise deadline without adopting a reading', async () => {
  const d = draft(); d.nodes[0]!.target = null; d.nodes[0]!.action = null; d.nodes[0]!.understanding = 'ambiguous';
  d.nodes[0]!.goal = '说明最迟2027-01-09T08:15:00-05:00交付，偏移不可省略';
  d.constraints = [{key: 'deadline', priorRef: null, ownerKey: 'a', scope: 'intent', referenceKey: null, kind: 'requirement', text: '最迟2027-01-09T08:15:00-05:00，保留偏移', expressionJson: null, sources: [src]}];
  d.issues = [{key: 'reading', ownerKey: 'a', fieldTarget: null, code: 'AMBIGUOUS_REFERENCE', category: 'ambiguity', message: '说明是待交付文档还是解释交付时间的动作？', sources: [src], candidates: [{key: 'document', intentKey: null, description: '交付说明文档', sources: [src]}, {key: 'explain', intentKey: null, description: '解释交付期限', sources: [src]}], questions: [{question: '请选择这句话的含义', optionKeys: ['document', 'explain']}]}];
  const intent = new Intent({executor: controlled(() => d)});
  try {
    const result = await intent.parse({input: d.nodes[0]!.goal});
    assert.equal(result.status, 'partial'); assert.equal(result.effective.intents[0]!.action, null);
    assert.equal(result.effective.intents[0]!.constraints[0]!.text, '最迟2027-01-09T08:15:00-05:00，保留偏移');
    assert.equal(result.issues[0]!.candidates!.length, 2);
    assert.equal(result.issues[0]!.questions![0]!.optionIds!.length, 2);
  } finally {await intent.dispose();}
});
