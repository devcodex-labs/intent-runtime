import test from 'node:test';
import assert from 'node:assert/strict';
import { Intent } from '../src/index.js';
import { draft, observation, controlled, src, retain } from './helpers.js';
import type { CandidateDraft } from '../src/model/candidate.js';

test('A model cannot relabel an exact finite dependency gap as validation strategy failure', async () => {
  const d = draft(); d.messages.mixed = 'The supplied condition is missing and complete possible worlds disagree.';
  d.observations = [observation('discount', 15)];
  d.issues = [{key: 'gap', ownerKey: 'a', fieldTarget: {container: 'inputs', field: 'discount', path: '/discount'}, code: 'FIELD_VALIDATION_UNDETERMINED', category: 'data', message: 'The local validation strategy could not decide', sources: [src], candidates: [], questions: []}];
  const schema = {type: 'object', properties: {discount: {type: 'number'}, isVip: {type: 'boolean'}}, if: {properties: {isVip: {const: true}}, required: ['isVip']}, then: {properties: {discount: {maximum: 20}}}, else: {properties: {discount: {maximum: 10}}}};
  const intent = new Intent({schema, executor: controlled(() => d)});
  try {
    await assert.rejects(intent.parse({input: 'Set discount to 15; VIP not supplied', fields: ['discount']}), (error: unknown) => {
      const e = error as {code: string; details: {violations: Array<{path: string}>}};
      assert.equal(e.code, 'MODEL_OUTPUT_INVALID'); assert.equal(e.details.violations[0]!.path, '/issues/0/code'); return true;
    });
    d.issues[0]!.code = 'FIELD_DEPENDENCY_MISSING'; d.issues[0]!.message = d.messages.mixed;
    const result = await intent.parse({input: 'Set discount to 15; VIP not supplied', fields: ['discount']});
    assert.equal(result.fieldResults[0]!.status, 'unknown');
    assert.deepEqual(result.effective.intents[0]!.inputs, {});
    assert.deepEqual(result.issues.map(q => q.code), ['FIELD_DEPENDENCY_MISSING']);
  } finally {await intent.dispose();}
});

test('Duplicate semantic dependency feedback locates the second field without hiding a stronger value requirement', async () => {
  const d = draft();
  d.observations = [observation('discount', 15), observation('isVip', true)];
  d.observations[0]!.semantic = {status: 'valid', explanation: 'VIP is explicitly true, so the discount applies', sources: [src], dependencies: [{field: 'isVip', requires: 'presence'}, {field: 'isVip', requires: 'value'}]};
  const intent = new Intent({schema: {type: 'object', properties: {discount: {type: 'number', description: 'Discount applies only for VIP true'}, isVip: {type: 'boolean'}}}, executor: controlled(() => d)});
  try {
    await assert.rejects(intent.parse({input: 'VIP true; discount 15', fields: ['discount']}), (error: unknown) => {
      const e = error as {code: string; details: {violations: Array<{path: string}>}};
      assert.equal(e.code, 'MODEL_OUTPUT_INVALID'); assert.equal(e.details.violations[0]!.path, '/observations/0/semantic/dependencies/1/field'); return true;
    });
    d.observations[0]!.semantic!.dependencies = [{field: 'isVip', requires: 'value'}];
    const corrected = await intent.parse({input: 'VIP true; discount 15', fields: ['discount']});
    assert.deepEqual(corrected.effective.intents[0]!.inputs, {discount: 15});
    assert.equal(corrected.fieldResults[0]!.status, 'present');
  } finally {await intent.dispose();}
});

test('Presence conditions never observe Object.prototype constructor as a supplied JSON field', async () => {
  const d = draft(); d.observations = [observation('x', 5), observation('constructor', undefined, 'a', 'inputs', 'absent')];
  const schema = {type: 'object', properties: {x: {type: 'number'}, constructor: {type: 'boolean'}}, if: {required: ['constructor']}, then: {properties: {x: {type: 'number', maximum: 0}}}, else: {properties: {x: {type: 'number', maximum: 10}}}};
  const intent = new Intent({schema, executor: controlled(() => d)});
  try {
    const absent = await intent.parse({input: 'x=5，constructor明确不存在', fields: ['x']});
    assert.deepEqual(absent.effective.intents[0]!.inputs, {x: 5});
    assert.equal(absent.fieldResults[0]!.status, 'present');
    d.observations[1] = observation('constructor', false);
    const present = await intent.parse({input: 'x=5，constructor=false', fields: ['x']});
    assert.deepEqual(present.effective.intents[0]!.inputs, {});
    assert.equal(present.fieldResults[0]!.status, 'invalid');
  } finally {await intent.dispose();}
});

test('Presence proof checks minProperties without requiring an unknown note value', async () => {
  const d = draft(); d.observations = [observation('x', 1), {...observation('note', undefined, 'a', 'inputs', 'present_unknown'), sources: [src]}];
  const intent = new Intent({schema: {type: 'object', properties: {x: {type: 'number'}, note: {type: 'string'}}, minProperties: 2}, executor: controlled(() => d)});
  try {const r = await intent.parse({input: 'x=1，note已存在但值未披露', fields: ['x']}); assert.deepEqual(r.effective.intents[0]!.inputs, {x: 1}); assert.equal(r.fieldResults[0]!.status, 'present');} finally {await intent.dispose();}
});

for (const [presence, status] of [['absent', 'invalid'], ['present_unknown', 'present']] as const) test('Presence-only dependency: ' + presence, async () => {
  const d = draft(); d.observations = [observation('x', 1), {...observation('note', undefined, 'a', 'inputs', presence), sources: [src]}];
  const intent = new Intent({schema: {type: 'object', properties: {x: {type: 'number'}, note: {type: 'string'}}, dependencies: {x: ['note']}}, executor: controlled(() => d)});
  try {const r = await intent.parse({input: 'x=1，已说明note存在状态', fields: ['x']}); assert.equal(r.fieldResults[0]!.status, status); assert.equal(Object.hasOwn(r.effective.intents[0]!.inputs, 'note'), false);} finally {await intent.dispose();}
});

test('Value-reading conditions still require a complete proof of unknown string values', async () => {
  const d = draft(); d.observations = [observation('x', 1), {...observation('note', undefined, 'a', 'inputs', 'present_unknown'), sources: [src]}];
  const intent = new Intent({schema: {type: 'object', properties: {x: {type: 'number'}, note: {type: 'string'}}, if: {properties: {note: {const: 'blocked'}}, required: ['note']}, then: {properties: {x: {maximum: 0}}}, else: {properties: {x: {minimum: 0}}}}, executor: controlled(() => d)});
  try {const r = await intent.parse({input: 'x=1，note值未披露', fields: ['x']}); assert.equal(r.fieldResults[0]!.status, 'unknown'); assert(r.issues.some(i => i.code === 'FIELD_VALIDATION_UNDETERMINED'));} finally {await intent.dispose();}
});

test('An independently violated conjunct is invalid even with an infinite unknown dependency', async () => {
  const d = draft(); d.observations = [observation('x', -1), {...observation('note', undefined, 'a', 'inputs', 'present_unknown'), sources: [src]}];
  const intent = new Intent({schema: {type: 'object', properties: {x: {type: 'number', minimum: 0}, note: {type: 'string'}}, if: {properties: {note: {const: 'blocked'}}, required: ['note']}, then: {properties: {x: {maximum: 0}}}}, executor: controlled(() => d)});
  try {const r = await intent.parse({input: 'x=-1，note值未知', fields: ['x']}); assert.equal(r.fieldResults[0]!.status, 'invalid'); assert(r.issues.some(i => i.code === 'FIELD_VALUE_INVALID')); assert.deepEqual(r.effective.intents[0]!.inputs, {});} finally {await intent.dispose();}
});

test('Scalar cardinality failure cannot choose the first of two supplied values', async () => {
  const d = draft(); d.observations = [observation('x', 'first')]; d.issues = [{key: 'cardinality', ownerKey: 'a', fieldTarget: {container: 'inputs', field: 'x', path: '/x'}, code: 'FIELD_CARDINALITY_MISMATCH', category: 'data', message: '一个字段不能代表两个不同对象', sources: [src], candidates: [], questions: []}];
  const intent = new Intent({schema: {type: 'object', properties: {x: {type: 'string'}}}, executor: controlled(() => d)});
  try {const r = await intent.parse({input: 'first和second', fields: ['x']}); assert.equal(r.fieldResults[0]!.status, 'invalid'); assert.deepEqual(r.effective.intents[0]!.inputs, {}); assert.equal(r.issues.length, 1);} finally {await intent.dispose();}
});
test('A real nested validation failure shares its exact issue with the language boundary without duplicating it', async () => {
  const d = draft(); d.observations = [observation('orders', [{amount: 10}, {amount: -5}])];
  d.issues = [{key: 'negative', ownerKey: 'a', fieldTarget: {container: 'inputs', field: 'orders', path: '/orders/1/amount'}, code: 'FIELD_VALUE_INVALID', category: 'data', message: 'The second amount is negative', sources: [src], candidates: [], questions: []}];
  const intent = new Intent({schema: {type: 'object', properties: {orders: {type: 'array', items: {type: 'object', properties: {amount: {type: 'number', minimum: 0}}}}}}, executor: controlled(() => d)});
  try {
    const result = await intent.parse({input: 'A amount 10, B amount -5', fields: ['orders']});
    assert.deepEqual(result.effective.intents[0]!.inputs, {});
    assert.deepEqual(result.fieldResults.map(f => f.path), ['/orders', '/orders/1/amount']);
    assert.equal(result.issues.length, 1); assert.equal(result.issues[0]!.path, '/orders/1/amount');
  } finally {await intent.dispose();}
});

test('Malformed field diagnostic pointers are model violations, not facility failures', async () => {
  const d = draft(); d.issues = [{key: 'q', ownerKey: 'a', fieldTarget: {container: 'inputs', field: 'endTime', path: '/endTime/a~2b'}, code: 'FIELD_VALUE_INVALID', category: 'data', message: '失败', sources: [src], candidates: [], questions: []}];
  const intent = new Intent({schema: timeSchema, executor: controlled(() => d)});
  try {await assert.rejects(intent.parse({input: '结束9点', fields: ['endTime']}), {code: 'MODEL_OUTPUT_INVALID', stage: 'validation'});} finally {await intent.dispose();}
});

const timeSchema = {type: 'object', properties: {startTime: {type: 'string', format: 'date-time'}, endTime: {type: 'string', format: 'date-time', description: '结束时间必须晚于开始时间'}}};
function semanticTime(d: CandidateDraft, status: 'valid' | 'invalid' | 'unknown', end: string): void {
  d.observations.push({...observation('endTime', end), semantic: {status, explanation: '根据给定起止时间判定顺序', sources: [src], dependencies: [{field: 'startTime', requires: 'value'}]}});
}

test('A described field cannot be declared present from a type-only validation', async () => {
  const d = draft(); d.observations = [observation('endTime', '2026-10-13T09:00:00Z')];
  const intent = new Intent({schema: timeSchema, executor: controlled(() => d)});
  try {const r = await intent.parse({input: '结束9点', fields: ['endTime']}); assert.equal(r.fieldResults[0]!.status, 'unknown'); assert.deepEqual(r.effective.intents[0]!.inputs, {});} finally {await intent.dispose();}
});

test('Missing semantic dependency cannot be concealed by a positive model verdict', async () => {
  const d = draft(); semanticTime(d, 'valid', '2026-10-13T11:00:00Z');
  const intent = new Intent({schema: timeSchema, executor: controlled(() => d)});
  try {const r = await intent.parse({input: '结束11点，开始未提供', fields: ['endTime']}); assert.equal(r.fieldResults[0]!.status, 'unknown'); assert(r.issues.some(i => i.code === 'FIELD_DEPENDENCY_MISSING'));} finally {await intent.dispose();}
});

test('Semantic invalidity clears on a supplied correction while preserving other parameters', async () => {
  let d = draft(); d.observations = [observation('startTime', '2026-10-13T10:00:00Z')]; semanticTime(d, 'invalid', '2026-10-13T09:00:00Z');
  const intent = new Intent({schema: timeSchema, executor: controlled(() => d)});
  try {
    const first = await intent.parse({input: '开始10点，结束9点', fields: 'all'});
    assert.deepEqual(first.effective.intents[0]!.inputs, {startTime: '2026-10-13T10:00:00Z'});
    d = retain(draft()); semanticTime(d, 'valid', '2026-10-13T11:00:00Z');
    const next = await intent.parse({input: '结束改为11点', fields: ['endTime'], baseline: first.effective});
    assert.equal(next.effective.intents[0]!.id, first.effective.intents[0]!.id); assert.equal(next.effective.intents[0]!.inputs.endTime, '2026-10-13T11:00:00Z'); assert.equal(next.issues.length, 0);
  } finally {await intent.dispose();}
});

test('Changing a semantic dependency rechecks and invalidates the old dependent value', async () => {
  let d = draft(); d.observations = [observation('startTime', '2026-10-13T10:00:00Z')]; semanticTime(d, 'valid', '2026-10-13T11:00:00Z');
  const intent = new Intent({schema: timeSchema, executor: controlled(() => d)});
  try {
    const first = await intent.parse({input: '开始10点，结束11点', fields: 'all'});
    d = retain(draft()); d.observations = [observation('startTime', '2026-10-13T12:00:00Z')]; semanticTime(d, 'invalid', '2026-10-13T11:00:00Z');
    d.observations[1]!.sources = [{root: 'baseline', pointer: '/intents/0/inputs/endTime'}];
    const next = await intent.parse({input: '开始改为12点', fields: ['startTime'], baseline: first.effective});
    assert.deepEqual(next.effective.intents[0]!.inputs, {startTime: '2026-10-13T12:00:00Z'}); assert(next.fieldResults.some(f => f.field === 'endTime' && f.status === 'invalidated'));
  } finally {await intent.dispose();}
});

test('A positive semantic verdict cannot bypass a real declared format failure', async () => {
  const d = draft(); d.observations = [observation('startTime', '2026-10-13T10:00:00Z')]; semanticTime(d, 'valid', 'not-a-date');
  const intent = new Intent({schema: timeSchema, executor: controlled(() => d)});
  try {const r = await intent.parse({input: '结束not-a-date', fields: ['endTime']}); assert.equal(r.fieldResults[0]!.status, 'invalid'); assert.deepEqual(r.effective.intents[0]!.inputs, {});} finally {await intent.dispose();}
});

test('Field issue ownership cannot invalidate another order', async () => {
  const d = draft(['a', 'b']); d.observations = [observation('startTime', '2026-10-13T10:00:00Z')]; semanticTime(d, 'invalid', '2026-10-13T09:00:00Z');
  d.observations.push(observation('startTime', '2026-10-13T10:00:00Z', 'b'), {...observation('endTime', '2026-10-13T11:00:00Z', 'b'), semantic: {status: 'valid', explanation: '结束时间晚于开始时间', sources: [src], dependencies: [{field: 'startTime', requires: 'value'}]}});
  const intent = new Intent({schema: timeSchema, executor: controlled(() => d)});
  try {const r = await intent.parse({input: 'A结束9点，B结束11点，均开始10点', fields: ['endTime']}); assert.deepEqual(r.effective.intents.map(n => n.inputs), [{}, {endTime: '2026-10-13T11:00:00Z'}]);} finally {await intent.dispose();}
});

for (const target of [null, {container: 'inputs' as const, field: 'endTime', path: '/startTime'}, {container: 'facts' as const, field: 'endTime', path: '/endTime'}]) test('Reject ambiguous or misowned field issue: ' + JSON.stringify(target), async () => {
  const d = draft(); d.issues = [{key: 'q', ownerKey: 'a', fieldTarget: target, code: 'FIELD_VALUE_INVALID', category: 'data', message: '非法', sources: [src], candidates: [], questions: []}];
  const intent = new Intent({schema: timeSchema, executor: controlled(() => d)});
  try {await assert.rejects(intent.parse({input: '结束9点', fields: ['endTime']}), {code: 'MODEL_OUTPUT_INVALID'});} finally {await intent.dispose();}
});

test('Missing localized message slots fail explicitly without an English fallback', async () => {
  const d = draft(); delete (d.messages as Partial<typeof d.messages>).invalid;
  const intent = new Intent({language: 'zh-CN', executor: controlled(() => d)});
  try {await assert.rejects(intent.parse({input: '分析'}), {code: 'MODEL_OUTPUT_INVALID'});} finally {await intent.dispose();}
});

for (const sources of [[], [{root: 'schema' as const, pointer: '/properties/flag'}]]) test('Known absence cannot be invented from missing evidence or a definition', async () => {
  const d = draft(); d.observations = [observation('x', 5), {...observation('flag', undefined, 'a', 'inputs', 'absent'), sources}];
  const intent = new Intent({schema: {type: 'object', properties: {x: {type: 'number'}, flag: {type: 'boolean'}}, if: {required: ['flag']}, then: {properties: {x: {maximum: 10}}}, else: {properties: {x: {maximum: 0}}}}, executor: controlled(() => d)});
  try {await assert.rejects(intent.parse({input: 'x=5，flag是否存在未提供', fields: ['x']}), {code: 'MODEL_OUTPUT_INVALID', stage: 'validation'});} finally {await intent.dispose();}
});

test('A dependency declared inside a guard can be read without becoming a selectable parameter', async () => {
  const d = draft(); d.observations = [observation('discount', 15), observation('isVip', true)];
  const intent = new Intent({schema: {type: 'object', properties: {discount: {type: 'number'}}, if: {properties: {isVip: {const: true}}, required: ['isVip']}, then: {properties: {discount: {maximum: 20}}}, else: {properties: {discount: {maximum: 10}}}}, executor: controlled(() => d)});
  try {const r = await intent.parse({input: 'VIP=true，优惠15', fields: ['discount']}); assert.deepEqual(r.effective.intents[0]!.inputs, {discount: 15}); await assert.rejects(intent.parse({input: 'VIP=true', fields: ['isVip']}), {code: 'FIELD_UNKNOWN'});} finally {await intent.dispose();}
});

test('Prose inside allOf field declarations cannot be lost after obligation splitting', async () => {
  const d = draft(); d.observations = [observation('endTime', '2026-10-13T09:00:00Z')];
  const intent = new Intent({schema: {type: 'object', properties: {endTime: {type: 'string', format: 'date-time'}}, allOf: [{properties: {endTime: {description: '结束时间必须晚于开始时间'}}}]}, executor: controlled(() => d)});
  try {const r = await intent.parse({input: '结束9点，开始未提供', fields: ['endTime']}); assert.equal(r.fieldResults[0]!.status, 'unknown'); assert.deepEqual(r.effective.intents[0]!.inputs, {});} finally {await intent.dispose();}
});

test('Prose in a conditional dependency stays relevant to the selected field', async () => {
  const d = draft(); d.observations = [observation('discount', 15), observation('isVip', true)];
  const intent = new Intent({schema: {type: 'object', properties: {discount: {type: 'number'}, isVip: {type: 'boolean'}}, if: {properties: {isVip: {const: true, description: 'VIP 状态必须有用户明确依据，不能按示例猜测'}}, required: ['isVip']}, then: {properties: {discount: {maximum: 20}}}}, executor: controlled(() => d)});
  try {const r = await intent.parse({input: '优惠15，身份未核实', fields: ['discount']}); assert.equal(r.fieldResults[0]!.status, 'unknown'); assert.deepEqual(r.effective.intents[0]!.inputs, {});} finally {await intent.dispose();}
});

for (const [type, status] of [['boolean', 'present'], ['string', 'unknown']] as const) test('Dynamic known presence remains in the complete property directory: ' + type, async () => {
  const d = draft(); d.observations = [observation('x', 1), {...observation('note_dynamic', undefined, 'a', 'inputs', 'present_unknown'), sources: [src]}];
  const intent = new Intent({schema: {type: 'object', properties: {x: {type: 'number'}}, patternProperties: {'^note_': {type}}, minProperties: 2}, executor: controlled(() => d)});
  try {const r = await intent.parse({input: 'x=1，note_dynamic明确存在但值未知', fields: ['x']}); assert.equal(r.fieldResults[0]!.status, status); assert.equal(Object.hasOwn(r.effective.intents[0]!.inputs, 'note_dynamic'), false); if (status === 'unknown') assert(r.issues.some(i => i.code === 'FIELD_VALIDATION_UNDETERMINED'));} finally {await intent.dispose();}
});

test('A finite dependency domain inside positive allOf is retained with the full rule', async () => {
  const d = draft(); d.observations = [observation('discount', 5)];
  const intent = new Intent({schema: {type: 'object', properties: {discount: {type: 'number'}}, allOf: [{properties: {isVip: {type: 'boolean'}}}], if: {properties: {isVip: {const: true}}, required: ['isVip']}, then: {properties: {discount: {maximum: 20}}}, else: {properties: {discount: {maximum: 10}}}}, executor: controlled(() => d)});
  try {const r = await intent.parse({input: '优惠5，VIP未知', fields: ['discount']}); assert.deepEqual(r.effective.intents[0]!.inputs, {discount: 5});} finally {await intent.dispose();}
});

test('The determined presence conjunct never checks a present unknown property as absent', async () => {
  const d = draft(); d.observations = [observation('x', 1), {...observation('note_dynamic', undefined, 'a', 'inputs', 'present_unknown'), sources: [src]}];
  const intent = new Intent({schema: {type: 'object', properties: {x: {type: 'number'}}, allOf: [{minProperties: 2}, {patternProperties: {'^note_': {type: 'string'}}}]}, executor: controlled(() => d)});
  try {const r = await intent.parse({input: 'x=1，note_dynamic存在且值未披露', fields: ['x']}); assert.equal(r.fieldResults[0]!.status, 'unknown'); assert(r.issues.some(i => i.code === 'FIELD_VALIDATION_UNDETERMINED'));} finally {await intent.dispose();}
});

test('A required-only guard reads explicit presence without demanding a root property declaration', async () => {
  const d = draft(); d.observations = [observation('discount', 5), {...observation('flag', undefined, 'a', 'inputs', 'present_unknown'), sources: [src]}];
  const intent = new Intent({schema: {type: 'object', properties: {discount: {type: 'number'}}, if: {required: ['flag']}, then: {properties: {discount: {maximum: 10}}}, else: {properties: {discount: {maximum: 0}}}}, executor: controlled(() => d)});
  try {const r = await intent.parse({input: '优惠5，flag明确存在', fields: ['discount']}); assert.deepEqual(r.effective.intents[0]!.inputs, {discount: 5});} finally {await intent.dispose();}
});

test('A dynamic boolean domain declared by additionalProperties is finite and complete', async () => {
  const d = draft(); d.observations = [observation('x', 1), {...observation('flag', undefined, 'a', 'inputs', 'present_unknown'), sources: [src]}];
  const intent = new Intent({schema: {type: 'object', properties: {x: {type: 'number'}}, additionalProperties: {type: 'boolean'}, minProperties: 2}, executor: controlled(() => d)});
  try {const r = await intent.parse({input: 'x=1，flag存在但值未知', fields: ['x']}); assert.deepEqual(r.effective.intents[0]!.inputs, {x: 1});} finally {await intent.dispose();}
});

test('Unknown existence gives a mixed proof, not a claim that a value is missing', async () => {
  const d = draft(); d.observations = [observation('x', 1)];
  const intent = new Intent({schema: {type: 'object', properties: {x: {type: 'number'}, note: {type: 'string'}}, minProperties: 2}, executor: controlled(() => d)});
  try {const r = await intent.parse({input: 'x=1', fields: ['x']}); assert.deepEqual(r.effective.intents[0]!.inputs, {}); assert(r.issues.some(i => i.code === 'FIELD_DEPENDENCY_MISSING'));} finally {await intent.dispose();}
});

test('A semantic field failure never admits the recognized invalid end time', async () => {
  const d = draft(); d.observations = [observation('startTime', '2026-10-13T10:00:00Z'), observation('endTime', '2026-10-13T09:00:00Z')];
  d.issues = [{key: 'end-order', ownerKey: 'a', fieldTarget: {container: 'inputs', field: 'endTime', path: '/endTime'}, code: 'FIELD_VALUE_INVALID', category: 'data', message: '结束时间必须晚于开始时间，当前不满足', sources: [src], candidates: [], questions: []}];
  const intent = new Intent({schema: {type: 'object', properties: {startTime: {type: 'string', format: 'date-time'}, endTime: {type: 'string', format: 'date-time', description: '结束时间必须晚于开始时间'}}}, executor: controlled(() => d)});
  try {const r = await intent.parse({input: '开始10点，结束9点', fields: ['endTime']}); assert.equal(Object.hasOwn(r.effective.intents[0]!.inputs, 'endTime'), false); assert.equal(r.fieldResults[0]!.status, 'invalid'); assert(r.issues.some(i => i.field === 'endTime' && i.path === '/endTime'));} finally {await intent.dispose();}
});

test('Chinese declaration failure explanations follow the configured language', async () => {
  const d = draft(); d.normalizedInput = 'x为负一'; d.nodes[0]!.goal = '理解给定数值';
  const intent = new Intent({language: 'zh-CN', schema: {type: 'object', properties: {x: {type: 'number', minimum: 0}}}, executor: controlled(() => d)});
  d.messages.invalid = '给定值不符合声明中的相关规则。'; d.observations = [observation('x', -1)];
  try {const r = await intent.parse({input: 'x=-1', fields: ['x']}); assert.match(r.fieldResults[0]!.explanation!, /[\u3400-\u9fff]/); assert.match(r.issues[0]!.message, /[\u3400-\u9fff]/);} finally {await intent.dispose();}
});
