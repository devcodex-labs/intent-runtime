import test from 'node:test';
import assert from 'node:assert/strict';
import {Intent} from '../src/index.js';
import type {ConstraintDraft} from '../src/model/candidate.js';
import {controlled, draft, node, src} from './helpers.js';
const noDb = (): ConstraintDraft => ({key: 'no-db', priorRef: null, ownerKey: 'parent', scope: 'intent', referenceKey: null, kind: 'prohibition', text: 'The user module and its children must not modify the database', expressionJson: null, sources: [src]});
test('Parent/child chain: withdrawal, English document, unresolved method, answer still forbids code changes', async () => {
  let d = draft(['parent', 'login', 'register']); d.nodes = [node('parent'), node('login', null, 'parent'), node('register', null, 'parent')]; d.nodes[0]!.expectedOutput = ['Description document']; d.constraints = [noDb()];
  const intent = new Intent({executor: controlled(() => d)});
  try {
    const first = await intent.parse({input: '用户模块含登录注册；不得写库；交付说明'}); const parent = first.effective.intents[0]!, login = parent.children[0]!, register = parent.children[1]!;
    assert.equal(first.effective.relations.length, 0); assert.equal(parent.children.length, 2); assert.equal(login.constraints.length, 0);
    d = draft(['parent']); d.kind = 'mixed'; d.usedHistory = true;
    d.nodes = [node('parent', {root: 'baseline', pointer: '/intents/0'}), node('login', {root: 'baseline', pointer: '/intents/0/children/0'}, 'parent')];
    d.nodes[0]!.expectedOutput = ['English description document']; d.constraints = [{...noDb(), priorRef: {root: 'baseline', pointer: '/intents/0/constraints/0'}}];
    d.priorTargets = [{kind: 'intent', key: 'register-old', priorRef: {root: 'baseline', pointer: '/intents/0/children/1'}}];
    d.changes = [{operation: 'withdraw', effect: 'applied', targetKind: 'intent', targetKey: 'register-old', conditionKey: null, description: 'Withdraw registration only', sources: [src], deltaHints: []}, {operation: 'modify', effect: 'applied', targetKind: 'intent', targetKey: 'parent', conditionKey: null, description: 'Change document to English', sources: [src], deltaHints: [{path: '/expectedOutput', operation: 'set'}]}];
    const second = await intent.parse({input: '取消注册，说明改英文，其余保留', baseline: first.effective});
    assert.equal(second.effective.intents[0]!.id, parent.id); assert.equal(second.effective.intents[0]!.children[0]!.id, login.id); assert.equal(second.effective.intents[0]!.constraints[0]!.id, parent.constraints[0]!.id);
    assert.equal(second.effective.intents[0]!.children.length, 1); assert.equal(second.turn.changes[0]!.target.kind === 'intent' && second.turn.changes[0]!.target.id, register.id);
    assert.deepEqual(second.turn.changes[1]!.effect === 'applied' && second.turn.changes[1]!.deltas?.[0]?.after, ['English description document']);
    d.relatedKeys = ['login']; d.kind = 'amendment'; d.priorTargets = []; d.nodes[1]!.understanding = 'ambiguous';
    d.changes = [{operation: 'modify', effect: 'unresolved', targetKind: 'intent', targetKey: 'login', conditionKey: null, description: 'Second method is unresolved', sources: [src], deltaHints: []}];
    d.issues = [{key: 'method', ownerKey: 'login', fieldTarget: null, code: 'AMBIGUOUS_REFERENCE', category: 'ambiguity', message: 'Second login method was not supplied', sources: [src], candidates: [], questions: [{question: 'Which login method?', optionKeys: []}]}];
    const third = await intent.parse({input: '登录采用第二种方式', baseline: second.effective}); assert.equal(third.status, 'partial'); assert.equal(third.issues.length, 1);
    d.nodes[1]!.understanding = 'clear'; d.nodes[1]!.goal = 'Email verification login'; d.kind = 'mixed'; d.issues = [];
    d.changes = [{operation: 'modify', effect: 'applied', targetKind: 'intent', targetKey: 'login', conditionKey: null, description: 'Clarify method only', sources: [src], deltaHints: []}, {operation: 'add', effect: 'applied', targetKind: 'constraint', targetKey: 'readonly', conditionKey: null, description: 'Do not modify code', sources: [src], deltaHints: []}];
    d.constraints.push({key: 'readonly', priorRef: null, ownerKey: 'login', scope: 'intent', referenceKey: null, kind: 'prohibition', text: 'Do not modify code now', expressionJson: null, sources: [src]});
    const fourth = await intent.parse({input: '邮箱验证码，先不要改代码', baseline: third.effective, context: {previousQuestions: third.issues}});
    assert.equal(fourth.issues.length, 0); assert.equal(fourth.effective.unresolved.length, 0); assert.equal(fourth.status, 'complete'); assert.equal(fourth.effective.intents[0]!.constraints[0]!.kind, 'prohibition'); assert.equal(fourth.effective.intents[0]!.children[0]!.constraints[0]!.text, 'Do not modify code now');
  } finally {await intent.dispose();}
});
test('Typed input ID is mapped while same-valued literal remains intact', async () => {
  const d = draft(); d.constraints = [{key: 'comparison', priorRef: null, ownerKey: 'a', scope: 'intent', referenceKey: null, kind: 'requirement', text: 'Code must be a', expressionJson: JSON.stringify({type: 'comparison', left: {type: 'input', intentId: 'a', path: '/code'}, operator: 'eq', right: {type: 'literal', value: {id: 'a'}}}), sources: [src]}];
  const intent = new Intent({schema: {type: 'object', properties: {code: {type: 'object', properties: {id: {type: 'string'}}}}}, executor: controlled(() => d)});
  try {const r = await intent.parse({input: 'code必须为a'}); const e = r.effective.intents[0]!.constraints[0]!.expression!; assert.equal(e.type, 'comparison'); if (e.type === 'comparison') {assert.equal(e.left.type === 'input' && e.left.intentId, r.effective.intents[0]!.id); assert.deepEqual(e.right.type === 'literal' && e.right.value, {id: 'a'});}} finally {await intent.dispose();}
});
test('Conditional withdrawal retains target and referenced condition', async () => {
  const d = draft(); d.constraints = [{key: 'if-failed', priorRef: null, ownerKey: 'a', scope: 'intent', referenceKey: null, kind: 'requirement', text: 'Withdraw only if tests fail', expressionJson: null, sources: [src]}];
  d.changes.push({operation: 'withdraw', effect: 'conditional', targetKind: 'intent', targetKey: 'a', conditionKey: 'if-failed', description: 'Conditional withdrawal, tests not checked', sources: [src], deltaHints: []}); const intent = new Intent({executor: controlled(() => d)});
  try {const r = await intent.parse({input: '要求A，测试失败才取消'}); assert.equal(r.effective.intents.length, 1); assert.equal(r.turn.changes[1]!.effect, 'conditional');} finally {await intent.dispose();}
});
test('Genuine contradictory before relations remain normal partial, never dropped', async () => {
  const d = draft(['a', 'b']); d.relations = [{key: 'ab', priorRef: null, fromKey: 'a', toKey: 'b', kind: 'before', condition: null, sources: [src]}, {key: 'ba', priorRef: null, fromKey: 'b', toKey: 'a', kind: 'before', condition: null, sources: [src]}]; const intent = new Intent({executor: controlled(() => d)});
  try {const r = await intent.parse({input: 'A先于B，B也先于A'}); assert.equal(r.status, 'partial'); assert.equal(r.effective.relations.length, 2); assert.ok(r.issues.some(q => q.code === 'RELATION_CONFLICT'));} finally {await intent.dispose();}
});
test('Model dangling references and child cycles are technical violations', async () => {
  const d = draft(); d.nodes[0]!.parentKey = 'a'; const intent = new Intent({executor: controlled(() => d)});
  try {await assert.rejects(intent.parse({input: 'test'}), {code: 'MODEL_OUTPUT_INVALID'}); d.nodes[0]!.parentKey = null; d.relations = [{key: 'bad', priorRef: null, fromKey: 'a', toKey: 'nonexistent', kind: 'before', condition: null, sources: [src]}]; await assert.rejects(intent.parse({input: 'test'}), {code: 'MODEL_OUTPUT_INVALID'});} finally {await intent.dispose();}
});
test('Inference and evidence target final nested tree; evidence=false does not hide inference', async () => {
  const d = draft(['parent', 'child']); d.nodes = [node('child', null, 'parent'), node('parent')]; d.nodes[0]!.target = null;
  d.inferences = [{target: {kind: 'intent', key: 'child', path: '/target'}, candidateJson: '"possible"', explanation: 'Not confirmed', sources: [src]}]; d.evidence = [{target: {kind: 'intent', key: 'child', path: '/goal'}, sources: [src]}]; const intent = new Intent({executor: controlled(() => d)});
  try {const r = await intent.parse({input: '模糊对象', output: {evidence: false}}); assert.equal(r.evidence, undefined); assert.equal(r.inferences[0]!.target, '/effective/intents/0/children/0/target'); assert.equal(r.effective.intents[0]!.children[0]!.target, null);} finally {await intent.dispose();}
});
test('Free Context restores prior goals from text without IDs/roles/StructuredIntent shape', async () => {
  const d = draft(['review', 'report']); d.usedHistory = true; d.kind = 'amendment';
  d.nodes = [node('review', {root: 'context', pointer: '/chatLog/0/say'}), node('report', {root: 'context', pointer: '/chatLog/0/say'})];
  d.nodes[0]!.goal = 'Analyze login'; d.nodes[1]!.goal = 'Generate Chinese report'; d.relatedKeys = ['report'];
  d.constraints = [{key: 'readonly', priorRef: {root: 'context', pointer: '/chatLog/1/say'}, ownerKey: null, scope: 'global', referenceKey: null, kind: 'prohibition', text: 'Do not modify code', expressionJson: null, sources: [{root: 'context', pointer: '/chatLog/1/say'}]}];
  d.changes = [{operation: 'modify', effect: 'applied', targetKind: 'intent', targetKey: 'report', conditionKey: null, description: 'Change report language only', sources: [src], deltaHints: []}];
  const intent = new Intent({executor: controlled(() => d)});
  try {const r = await intent.parse({input: '报告改中文，其他不变', context: {chatLog: [{who: 'human', say: '分析登录，生成英文报告'}, {who: 'human', say: '整个过程不改代码'}]}}); assert.equal(r.effective.intents.length, 2); assert.equal(r.turn.changes.length, 1); assert.equal(r.turn.changes[0]!.operation, 'modify'); assert.equal(r.effective.constraints[0]!.text, 'Do not modify code');} finally {await intent.dispose();}
});
test('Agent object identity/old inputs inherit through Context without baseline or children keys', async () => {
  const d = draft(); d.usedHistory = true; d.nodes[0]!.priorRef = {root: 'context', pointer: '/ongoing/0'};
  d.changes = [{operation: 'modify', effect: 'applied', targetKind: 'intent', targetKey: 'a', conditionKey: null, description: 'Only update document language', sources: [src], deltaHints: []}];
  const intent = new Intent({executor: controlled(() => d)});
  try {const r = await intent.parse({input: '报告改英文，金额不变', context: {ongoing: [{id: 'agent-task-7', title: '采购报告', inputs: {amount: 500}}]}}); assert.equal(r.effective.intents[0]!.id, 'agent-task-7'); assert.equal(r.effective.intents[0]!.inputs.amount, 500); assert.equal(r.fieldResults.length, 0);} finally {await intent.dispose();}
});
test('Clear current prohibition stays complete while prior history coverage is unavailable', async () => {
  const d = draft([]); d.kind = 'amendment'; d.usedHistory = true; d.historyCoverage = 'unavailable';
  d.constraints = [{key: 'no-network', priorRef: null, ownerKey: null, scope: 'global', referenceKey: null, kind: 'prohibition', text: 'Do not access the network', expressionJson: null, sources: [src]}];
  d.changes = [{operation: 'add', effect: 'applied', targetKind: 'constraint', targetKey: 'no-network', conditionKey: null, description: 'Add clear current prohibition', sources: [src], deltaHints: []}];
  d.issues = [{key: 'history', ownerKey: null, fieldTarget: null, code: 'CONTEXT_INCOMPLETE', category: 'context', message: 'The prior task is not recoverable from supplied history', sources: [{root: 'context', pointer: '/priorNote'}], candidates: [], questions: []}];
  const intent = new Intent({executor: controlled(() => d)});
  try {const r = await intent.parse({input: '先补充：不要联网', context: {priorNote: '只知道上周讨论过任务'}}); assert.equal(r.status, 'complete'); assert.equal(r.effective.coverage, 'partial'); assert.equal(r.effective.constraints.length, 1); assert.equal(r.issues[0]!.code, 'CONTEXT_INCOMPLETE');} finally {await intent.dispose();}
});
test('An explicitly changed historical field invalidates even without a current extraction schema', async () => {
  const d = draft(); d.usedHistory = true; d.nodes[0]!.priorRef = {root: 'context', pointer: '/prior'};
  d.observations = [{ownerKey: 'a', container: 'inputs', semantic: null, field: 'orderId', presence: 'known', valueJson: '"B"', rawText: 'B', sources: [src]}];
  d.changes = [{operation: 'modify', effect: 'applied', targetKind: 'intent', targetKey: 'a', conditionKey: null, description: 'Change order A to B, without extracting B', sources: [src], deltaHints: []}];
  const intent = new Intent({executor: controlled(() => d)});
  try {const r = await intent.parse({input: '订单改B', context: {prior: {id: 'order', inputs: {orderId: 'A'}}}}); assert.deepEqual(r.effective.intents[0]!.inputs, {}); assert.equal(r.fieldResults[0]!.trigger, 'invalidation'); assert.equal(r.fieldResults[0]!.status, 'invalidated');} finally {await intent.dispose();}
});
test('JSON key reordering alone never invalidates an inherited object parameter', async () => {
  const d = draft(); d.usedHistory = true; d.nodes[0]!.priorRef = {root: 'context', pointer: '/prior'};
  d.observations = [{ownerKey: 'a', container: 'inputs', field: 'settings', presence: 'known', valueJson: '{"b":2,"a":1}', rawText: null, sources: [src], semantic: null}];
  d.changes = [{operation: 'modify', effect: 'applied', targetKind: 'intent', targetKey: 'a', conditionKey: null, description: 'Only change the report language', sources: [src], deltaHints: []}];
  const intent = new Intent({executor: controlled(() => d)});
  try {const r = await intent.parse({input: '报告改英文，设置不变', context: {prior: {id: 'report', inputs: {settings: {a: 1, b: 2}}}}}); assert.deepEqual(r.effective.intents[0]!.inputs.settings, {a: 1, b: 2}); assert.equal(r.fieldResults.length, 0);} finally {await intent.dispose();}
});
