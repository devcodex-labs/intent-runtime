import test from 'node:test';
import assert from 'node:assert/strict';
import {Intent} from '../src/index.js';
import type {ConstraintDraft} from '../src/model/candidate.js';
import {controlled, draft, node, src, observation} from './helpers.js';
const noDb = (): ConstraintDraft => ({key: 'no-db', priorRef: null, ownerKey: 'parent', scope: 'intent', referenceKey: null, kind: 'prohibition', text: 'The user module and its children must not modify the database', expressionJson: null, sources: [src]});
test('Withdrawing only a constraint is an amendment and cannot claim intent withdrawal', async () => {
  let d = draft();
  d.constraints = [{key: 'offline', priorRef: null, ownerKey: null, scope: 'global', referenceKey: null, kind: 'prohibition', text: 'Do not access the network', expressionJson: null, sources: [src]}];
  const intent = new Intent({executor: controlled(() => d)});
  try {
    const first = await intent.parse({input: 'Analyze the order; do not access the network'});
    d = draft(); d.nodes[0]!.priorRef = {root: 'baseline', pointer: '/intents/0'};
    d.relatedKeys = []; d.usedHistory = true; d.kind = 'withdrawal';
    d.priorTargets = [{kind: 'constraint', key: 'offline', priorRef: {root: 'baseline', pointer: '/constraints/0'}}];
    d.changes = [{operation: 'withdraw', effect: 'applied', targetKind: 'constraint', targetKey: 'offline', conditionKey: null, description: 'Remove only the network restriction', sources: [src], deltaHints: []}];
    await assert.rejects(intent.parse({input: 'Remove the network restriction; keep the analysis', baseline: first.effective}), (error: unknown) => {
      const e = error as {code: string; details: {violations: Array<{path: string}>}};
      assert.equal(e.code, 'MODEL_OUTPUT_INVALID'); assert.equal(e.details.violations[0]!.path, '/kind'); return true;
    });
    d.kind = 'amendment';
    const result = await intent.parse({input: 'Remove the network restriction; keep the analysis', baseline: first.effective});
    assert.equal(result.turn.kind, 'amendment');
    assert.equal(result.effective.intents[0]!.id, first.effective.intents[0]!.id);
    assert.equal(result.effective.constraints.length, 0);
  } finally {await intent.dispose();}
});
test('A new business cancellation request cannot masquerade as withdrawal of a prior intent', async () => {
  const d = draft(); d.kind = 'withdrawal';
  d.nodes[0]!.action = 'cancel_shipment'; d.nodes[0]!.goal = 'Cancel the shipment request, keeping the order';
  const intent = new Intent({executor: controlled(() => d)});
  try {
    await assert.rejects(intent.parse({input: 'Cancel the shipment request, keeping the order'}), {code: 'MODEL_OUTPUT_INVALID'});
    d.kind = 'request';
    const result = await intent.parse({input: 'Cancel the shipment request, keeping the order'});
    assert.equal(result.turn.kind, 'request');
    assert.equal(result.turn.changes[0]!.operation, 'add');
    assert.equal(result.effective.intents[0]!.action, 'cancel_shipment');
  } finally {await intent.dispose();}
});
test('Constraint ownership feedback locates the exact candidate slot for host correction', async () => {
  const d = draft();
  d.constraints = [{key: 'no-code', priorRef: null, ownerKey: null, scope: 'phase', referenceKey: null, kind: 'prohibition', text: 'Do not modify code in this phase', expressionJson: null, sources: [src]}];
  const intent = new Intent({executor: controlled(() => d)});
  const rejectsAt = async (path: string) => assert.rejects(intent.parse({input: 'Analyze this order; do not modify code in this phase'}), (error: unknown) => {
    const e = error as {code: string; details: {violations: Array<{path: string; rule: string}>}};
    assert.equal(e.code, 'MODEL_OUTPUT_INVALID');
    assert.deepEqual(e.details.violations[0], {rule: 'REFERENCE_NOT_FOUND', path});
    return true;
  });
  try {
    await rejectsAt('/constraints/0/ownerKey');
    d.constraints[0]!.ownerKey = 'missing-owner';
    await rejectsAt('/constraints/0/ownerKey');
    d.constraints[0]!.ownerKey = 'a'; d.constraints[0]!.scope = 'target';
    await rejectsAt('/constraints/0/referenceKey');
    d.constraints[0]!.scope = 'phase';
    const result = await intent.parse({input: 'Analyze this order; do not modify code in this phase'});
    assert.deepEqual(result.effective.intents[0]!.constraints[0]!.scope, {type: 'phase', intentId: result.effective.intents[0]!.id});
  } finally {await intent.dispose();}
});
test('A proven ordering cycle stays a relation conflict without invented constraint conflicts', async () => {
  const d = draft(['a', 'b']);
  d.nodes.forEach(n => {n.understanding = 'conflicted';});
  d.relations = [
    {key: 'ab', priorRef: null, fromKey: 'a', toKey: 'b', kind: 'before', condition: null, sources: [src]},
    {key: 'ba', priorRef: null, fromKey: 'b', toKey: 'a', kind: 'before', condition: null, sources: [src]},
  ];
  d.issues = [{key: 'cycle', ownerKey: null, fieldTarget: null, code: 'RELATION_CONFLICT', category: 'conflict', message: 'A before B and B before A cannot both hold', sources: [src], candidates: [], questions: []}];
  const intent = new Intent({executor: controlled(() => d)});
  try {
    const result = await intent.parse({input: 'Analyze A and B; A before B and B before A'});
    assert.equal(result.status, 'partial');
    assert.deepEqual(result.issues.map(q => q.code), ['RELATION_CONFLICT']);
    assert.equal(result.effective.relations.length, 2);
    d.issues = []; d.nodes.forEach(n => {n.understanding = 'clear';});
    const detected = await intent.parse({input: 'Analyze A and B; A before B and B before A'});
    assert.deepEqual(detected.issues.map(q => q.code), ['RELATION_CONFLICT']);
    assert.deepEqual(detected.effective.intents.map(n => n.understanding), ['conflicted', 'conflicted']);
  } finally {await intent.dispose();}
});
test('A current added intent cannot disappear from turn.intentIds', async () => {
  const d = draft(); d.relatedKeys = [];
  const intent = new Intent({executor: controlled(() => d)});
  try {
    await assert.rejects(intent.parse({input: '查询订单000123'}), {code: 'MODEL_OUTPUT_INVALID'});
    d.relatedKeys = ['a'];
    const result = await intent.parse({input: '查询订单000123'});
    assert.deepEqual(result.turn.intentIds, [result.effective.intents[0]!.id]);
  } finally {await intent.dispose();}
});
test('Removing the first reference permits array index shifts and preserves a target-scoped restriction', async () => {
  const d = draft();
  d.references = ['A', 'B', 'C'].map(key => ({key, ownerKey: 'a', priorRef: null, kind: 'entity' as const, intentKey: null, entityRef: key, resolved: true, description: key, sources: [src]}));
  d.constraints = [{key: 'no-B', priorRef: null, ownerKey: 'a', scope: 'target', referenceKey: 'B', kind: 'prohibition', text: 'Do not modify B', expressionJson: null, sources: [src]}];
  const intent = new Intent({executor: controlled(() => d)});
  try {
    const first = await intent.parse({input: 'Analyze A, B and C; do not modify B'});
    const old = first.effective.intents[0]!;
    d.nodes[0]!.priorRef = {root: 'baseline', pointer: '/intents/0'};
    d.kind = 'amendment'; d.usedHistory = true;
    d.references = d.references.slice(1).map((ref, i) => ({...ref, priorRef: {root: 'baseline' as const, pointer: '/intents/0/references/' + (i + 1)}}));
    d.constraints[0]!.priorRef = {root: 'baseline', pointer: '/intents/0/constraints/0'};
    d.changes = [{operation: 'modify', effect: 'applied', targetKind: 'intent', targetKey: 'a', conditionKey: null, description: 'Remove A; keep B, C and the restriction', sources: [src], deltaHints: [{path: '/references/0', operation: 'remove'}]}];
    const next = await intent.parse({input: 'Remove A; retain B and C and their restriction', baseline: first.effective});
    const current = next.effective.intents[0]!;
    assert.deepEqual(current.references.map(ref => ref.id), old.references.slice(1).map(ref => ref.id));
    assert.equal(current.constraints[0]!.scope.type, 'target');
    assert.equal((current.constraints[0]!.scope as {referenceId: string}).referenceId, old.references[1]!.id);
    assert.deepEqual(next.turn.changes[0]!.effect === 'applied' && next.turn.changes[0]!.deltas?.[0], {path: '/references/0', operation: 'remove', before: old.references[0]});
    d.references = ['C', 'B', 'A'].map(key => ({key, ownerKey: 'a', priorRef: {root: 'baseline' as const, pointer: '/intents/0/references/' + ['A', 'B', 'C'].indexOf(key)}, kind: 'entity' as const, intentKey: null, entityRef: key, resolved: true, description: key, sources: [src]}));
    await assert.rejects(intent.parse({input: 'Only reorder; A remains present', baseline: first.effective}), {code: 'MODEL_OUTPUT_INVALID'});
  } finally {await intent.dispose();}
});
test('Source feedback identifies the candidate slot and never echoes an invented sensitive quote', async () => {
  const d = draft(); d.nodes[0]!.sources = [{root: 'input', pointer: '', quote: 'SENSITIVE_INVENTED_QUOTE'}];
  const intent = new Intent({executor: controlled(() => d)});
  try {
    await assert.rejects(intent.parse({input: 'public request'}), (error: unknown) => {
      const e = error as {code: string; details: {violations: Array<{path: string}>}};
      assert.equal(e.code, 'MODEL_OUTPUT_INVALID');
      assert.equal(e.details.violations[0]!.path, '/nodes/0/sources/0/quote');
      assert.equal(JSON.stringify(error).includes('SENSITIVE_INVENTED_QUOTE'), false);
      return true;
    });
  } finally {await intent.dispose();}
});
test('A missing historical intent link points to its candidate key slot and can become an unresolved source reference', async () => {
  const d = draft(); d.historyCoverage = 'unavailable'; d.nodes[0]!.understanding = 'incomplete';
  d.references = [{key: 'history', ownerKey: 'a', priorRef: null, kind: 'intent', intentKey: null, entityRef: null, resolved: false, description: 'Last month requirements were not supplied', sources: [src]}];
  const intent = new Intent({executor: controlled(() => d)});
  try {
    await assert.rejects(intent.parse({input: 'Continue last month requirements; they were not supplied'}), (error: unknown) => {
      const e = error as {code: string; details: {violations: Array<{path: string}>}};
      assert.equal(e.code, 'MODEL_OUTPUT_INVALID'); assert.equal(e.details.violations[0]!.path, '/references/0/intentKey'); return true;
    });
    d.references[0]!.kind = 'source';
    const result = await intent.parse({input: 'Continue last month requirements; they were not supplied'});
    assert.equal(result.status, 'partial');
    assert.equal(result.effective.intents[0]!.references[0]!.ref, null);
    assert.equal(result.effective.intents[0]!.references[0]!.resolved, false);
    // The current continuation intent is identified, but its historical target
    // is missing. The contract requires incomplete coverage, not preservation
    // of a model-supplied coverage label over the assembled known intent.
    assert.equal(result.effective.coverage, 'partial');
  } finally {await intent.dispose();}
});
test('Evidence for an excluded invalid field identifies the exact final-target path for correction', async () => {
  const d = draft(); d.observations = [observation('amount', -3)];
  d.evidence = [{target: {kind: 'intent', key: 'a', path: '/inputs/amount'}, sources: [src]}];
  const intent = new Intent({schema: {type: 'object', properties: {amount: {type: 'number', minimum: 0}}}, executor: controlled(() => d)});
  try {
    await assert.rejects(intent.parse({input: 'Create order with amount -3', fields: ['amount'], output: {evidence: true}}), (error: unknown) => {
      const e = error as {code: string; details: {violations: Array<{path: string}>}};
      assert.equal(e.code, 'MODEL_OUTPUT_INVALID'); assert.equal(e.details.violations[0]!.path, '/evidence/0/target/path'); return true;
    });
    d.evidence[0]!.target.path = '';
    const corrected = await intent.parse({input: 'Create order with amount -3', fields: ['amount'], output: {evidence: true}});
    assert.deepEqual(corrected.effective.intents[0]!.inputs, {});
    assert.equal(corrected.fieldResults[0]!.status, 'invalid');
    assert.equal(corrected.evidence![0]!.target, '/effective/intents/0');
  } finally {await intent.dispose();}
});
test('Invalid expression fragment feedback points to its original JSON-string slot', async () => {
  const d = draft(); d.constraints = [{key: 'budget', priorRef: null, ownerKey: 'a', scope: 'intent', referenceKey: null, kind: 'requirement', text: 'budget at most 100', expressionJson: '{"field":"budget","operator":"<=","value":100}', sources: [src]}];
  const intent = new Intent({executor: controlled(() => d)});
  try {await assert.rejects(intent.parse({input: 'budget at most 100'}), (error: unknown) => {
    const e = error as {code: string; details: {violations: Array<{path: string}>}};
    assert.equal(e.code, 'MODEL_OUTPUT_INVALID'); assert.equal(e.details.violations[0]!.path, '/constraints/0/expressionJson'); return true;
  });} finally {await intent.dispose();}
});
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
test('An unconfirmed inference cannot also be an authoritative extracted business input', async () => {
  const d = draft(); d.observations = [observation('orderId', '000123')];
  d.inferences = [{target: {kind: 'intent', key: 'a', path: '/inputs/orderId'}, candidateJson: '"000123"', explanation: 'Unconfirmed possible order', sources: [src]}];
  const intent = new Intent({schema: {type: 'object', properties: {orderId: {type: 'string'}}}, executor: controlled(() => d)});
  try {
    await assert.rejects(intent.parse({input: 'possible order 000123', fields: ['orderId']}), {code: 'MODEL_OUTPUT_INVALID'});
    d.inferences = [];
    assert.equal((await intent.parse({input: 'query order 000123', fields: ['orderId']})).effective.intents[0]!.inputs.orderId, '000123');
  } finally {await intent.dispose();}
});
for (const slot of ['inferences', 'evidence'] as const) test('Malformed ' + slot + ' locator is a candidate violation, including when evidence is disabled', async () => {
  const d = draft();
  if (slot === 'inferences') d.inferences = [{target: {kind: 'intent', key: 'a', path: '/a~2b'}, candidateJson: null, explanation: 'Unknown', sources: [src]}];
  else d.evidence = [{target: {kind: 'intent', key: 'a', path: 'target'}, sources: [src]}];
  const intent = new Intent({executor: controlled(() => d)});
  try {await assert.rejects(intent.parse({input: 'query', output: {evidence: false}}), {code: 'MODEL_OUTPUT_INVALID', stage: 'validation'});} finally {await intent.dispose();}
});
test('Expression-only and unselected validation dependencies retain actual Context provenance', async () => {
  let d = draft();
  d.constraints = [{key: 'approved', priorRef: null, ownerKey: 'a', scope: 'intent', referenceKey: null, kind: 'precondition', text: 'Approval is required', expressionJson: JSON.stringify({type: 'comparison', left: {type: 'source', ref: {root: 'context', pointer: '/approved'}}, operator: 'eq', right: {type: 'literal', value: true}}), sources: [src]}];
  const schema = {type: 'object', properties: {isVip: {type: 'boolean'}, discount: {type: 'number'}}, if: {properties: {isVip: {const: true}}, required: ['isVip']}, then: {properties: {discount: {maximum: 20}}}, else: {properties: {discount: {maximum: 10}}}};
  const intent = new Intent({schema, executor: controlled(() => d)});
  const rejectsScope = async (input: string, context: Record<string, boolean>, fields: string[]) => assert.rejects(intent.parse({input, context, fields}), (error: unknown) => {
    const e = error as {code: string; details: {violations: Array<{path: string}>}};
    assert.equal(e.code, 'MODEL_OUTPUT_INVALID'); assert.equal(e.details.violations[0]!.path, '/usedHistory'); return true;
  });
  try {
    await rejectsScope('Act only under the supplied approval', {approved: true}, []);
    d.usedHistory = true;
    assert.equal((await intent.parse({input: 'Act only under the supplied approval', context: {approved: true}})).effective.scope, 'provided_materials');
    d = draft(); d.observations = [observation('discount', 15), {...observation('isVip', true), sources: [{root: 'context', pointer: '/vip'}]}];
    await rejectsScope('Set discount 15', {vip: true}, ['discount']);
    d.usedHistory = true;
    const selected = await intent.parse({input: 'Set discount 15', context: {vip: true}, fields: ['discount']});
    assert.equal(selected.effective.scope, 'provided_materials');
    assert.deepEqual(selected.effective.intents[0]!.inputs, {discount: 15});
    d.usedHistory = false;
    const unused = await intent.parse({input: 'Query A only', context: {vip: true}, fields: []});
    assert.equal(unused.effective.scope, 'current_request');
    assert.deepEqual(unused.effective.intents[0]!.inputs, {});
  } finally {await intent.dispose();}
});
test('Using a supplied context source cannot claim current_request scope, while unrelated Context remains unused', async () => {
  const d = draft(); d.nodes[0]!.sources = [{root: 'context', pointer: '/related'}];
  const intent = new Intent({executor: controlled(() => d)});
  try {
    await assert.rejects(intent.parse({input: 'query that order', context: {related: 'order A'}}), {code: 'MODEL_OUTPUT_INVALID'});
    d.usedHistory = true;
    assert.equal((await intent.parse({input: 'query that order', context: {related: 'order A'}})).effective.scope, 'provided_materials');
    d.nodes[0]!.sources = [src]; d.usedHistory = false;
    assert.equal((await intent.parse({input: 'query B', context: {unrelated: 'old order A'}})).effective.scope, 'current_request');
  } finally {await intent.dispose();}
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
  d.observations = [{ownerKey: 'a', container: 'inputs', semantic: null, field: 'orderId', presence: 'known', withdrawn: false, valueJson: '"B"', rawText: 'B', sources: [src]}];
  d.changes = [{operation: 'modify', effect: 'applied', targetKind: 'intent', targetKey: 'a', conditionKey: null, description: 'Change order A to B, without extracting B', sources: [src], deltaHints: []}];
  const intent = new Intent({executor: controlled(() => d)});
  try {const r = await intent.parse({input: '订单改B', context: {prior: {id: 'order', inputs: {orderId: 'A'}}}}); assert.deepEqual(r.effective.intents[0]!.inputs, {}); assert.equal(r.fieldResults[0]!.trigger, 'invalidation'); assert.equal(r.fieldResults[0]!.status, 'invalidated');} finally {await intent.dispose();}
});
test('JSON key reordering alone never invalidates an inherited object parameter', async () => {
  const d = draft(); d.usedHistory = true; d.nodes[0]!.priorRef = {root: 'context', pointer: '/prior'};
  d.observations = [{ownerKey: 'a', container: 'inputs', field: 'settings', presence: 'known', withdrawn: false, valueJson: '{"b":2,"a":1}', rawText: null, sources: [src], semantic: null}];
  d.changes = [{operation: 'modify', effect: 'applied', targetKind: 'intent', targetKey: 'a', conditionKey: null, description: 'Only change the report language', sources: [src], deltaHints: []}];
  const intent = new Intent({executor: controlled(() => d)});
  try {const r = await intent.parse({input: '报告改英文，设置不变', context: {prior: {id: 'report', inputs: {settings: {a: 1, b: 2}}}}}); assert.deepEqual(r.effective.intents[0]!.inputs.settings, {a: 1, b: 2}); assert.equal(r.fieldResults.length, 0);} finally {await intent.dispose();}
});
