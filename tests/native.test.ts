import test from 'node:test';
import assert from 'node:assert/strict';
import {s, ObjectDslBuilder} from 'schema-dsl/pure';
import {Intent, IntentError, INTENT_RESULT_SCHEMA, type IntentSchema, type IntentConfig} from '../src/index.js';
import {BusinessValidator, ValidationBudget, classify, ABSENT} from '../src/schema/validate.js';
import {Definition} from '../src/schema/compile.js';
import {schemaSnapshot} from '../src/schema/snapshot.js';
import {snapshot, measure} from '../src/internal/json.js';
import {draft, observation, controlled, retain, src, node} from './helpers.js';
const vip: IntentSchema = {type: 'object', properties: {isVip: {type: 'boolean'}, discount: {type: 'number', minimum: 0}}, required: ['discount'], if: {properties: {isVip: {const: true}}, required: ['isVip']}, then: {properties: {discount: {maximum: 20}}}, else: {properties: {discount: {maximum: 10}}}, additionalProperties: false};
test('Native real field chain: 000123 -> separate orders -> VIP15 -> false invalidates -> 5 clears', async () => {
  let candidate = draft(); const intent = new Intent({executor: controlled(() => candidate), schema: s({orderId: 'string!', isVip: 'boolean', discount: 'number:0-'})});
  try {
    candidate.observations = [observation('orderId', '000123')];
    const first = await intent.parse({input: '查询订单000123', fields: ['orderId']});
    assert.equal(first.effective.intents[0]!.inputs.orderId, '000123'); assert.equal(first.status, 'complete');
    assert.equal(first.turn.intentIds[0], first.effective.intents[0]!.id); assert.equal('data' in first, false); assert.equal('intents' in first.turn, false);
    candidate = draft(['a', 'b']); candidate.observations = [observation('orderId', 'A'), observation('orderId', 'B', 'b')];
    const second = await intent.parse({input: '查询订单A和B', fields: ['orderId']}); assert.deepEqual(second.effective.intents.map(n => n.inputs.orderId), ['A', 'B']);
  } finally {await intent.dispose();}
  candidate = draft(); const discounts = new Intent({executor: controlled(() => candidate), schema: vip});
  try {
    candidate.observations = [observation('isVip', true), observation('discount', 15)];
    const first = await discounts.parse({input: '设置VIP=true，优惠15', fields: 'all'}); assert.deepEqual(first.effective.intents[0]!.inputs, {isVip: true, discount: 15});
    candidate = retain(draft()); candidate.observations = [observation('isVip', false)];
    const second = await discounts.parse({input: 'VIP改为false', fields: ['isVip'], baseline: first.effective});
    assert.equal(second.effective.intents[0]!.id, first.effective.intents[0]!.id); assert.deepEqual(second.effective.intents[0]!.inputs, {isVip: false});
    assert.ok(second.fieldResults.some(f => f.field === 'discount' && f.trigger === 'invalidation' && f.status === 'invalidated')); assert.ok(second.issues.some(q => q.code === 'FIELD_INVALIDATED'));
    candidate = retain(draft()); candidate.observations = [observation('discount', 5)];
    const third = await discounts.parse({input: '优惠改为5', fields: ['discount'], baseline: second.effective, context: {previousIssues: second.issues}});
    assert.deepEqual(third.effective.intents[0]!.inputs, {isVip: false, discount: 5}); assert.equal(third.issues.length, 0); assert.equal(third.fieldResults.length, 1);
  } finally {await discounts.dispose();}
});
for (const [value, status] of [[5, 'present'], [15, 'unknown'], [30, 'invalid']] as const) test('Unknown VIP preserves exact outcome for discount ' + value, async () => {
  const d = draft(); d.observations = [observation('discount', value)]; const intent = new Intent({schema: vip, executor: controlled(() => d)});
  try {const result = await intent.parse({input: '优惠' + value, fields: ['discount']}); assert.equal(result.fieldResults[0]!.status, status); assert.equal(result.effective.intents[0]!.inputs.isVip, undefined); assert.equal(result.status, 'complete');} finally {await intent.dispose();}
});
test('Unselected known dependency validates without entering inputs', async () => {
  const d = draft(); d.observations = [observation('discount', 15), observation('isVip', true)]; const intent = new Intent({schema: vip, executor: controlled(() => d)});
  try {assert.deepEqual((await intent.parse({input: 'VIP=true优惠15', fields: ['discount']})).effective.intents[0]!.inputs, {discount: 15});} finally {await intent.dispose();}
});
test('fields=[] retains unchanged, invalidates direct edits without extracting replacements', async () => {
  let d = draft(); d.observations = [observation('orderId', 'A')]; const intent = new Intent({schema: s({orderId: 'string!'}), executor: controlled(() => d)});
  try {
    const first = await intent.parse({input: '查询订单A', fields: ['orderId']}); d = retain(draft());
    const kept = await intent.parse({input: '其他不变', baseline: first.effective}); assert.deepEqual(kept.effective.intents[0]!.inputs, {orderId: 'A'}); assert.deepEqual(kept.fieldResults, []);
    d.observations = [observation('orderId', 'B')]; const changed = await intent.parse({input: '订单改B', baseline: first.effective}); assert.deepEqual(changed.effective.intents[0]!.inputs, {}); assert.equal(changed.fieldResults[0]!.status, 'invalidated');
  } finally {await intent.dispose();}
});
test('Selected required missing field is data issue, not absent intent or model retry', async () => {
  let calls = 0; const d = draft(); const intent = new Intent({schema: s({productId: 'string!'}), executor: controlled(() => {calls++; return d;})});
  try {const r = await intent.parse({input: '创建订单', fields: ['productId']}); assert.equal(r.status, 'complete'); assert.equal(r.issues[0]!.code, 'FIELD_REQUIRED_MISSING'); assert.equal(calls, 1);} finally {await intent.dispose();}
});
test('Statement facts preserve identifier without creating action', async () => {
  const d = draft([]); d.kind = 'statement'; d.observations = [observation('orderId', '000123', null, 'facts')]; const intent = new Intent({schema: s({orderId: 'string!'}), executor: controlled(() => d)});
  try {const r = await intent.parse({input: '编号000123', fields: ['orderId']}); assert.equal(r.turn.facts.orderId, '000123'); assert.equal(r.effective.intents.length, 0);} finally {await intent.dispose();}
});
test('Invalid second array item keeps original path and independent field', async () => {
  const d = draft(); d.observations = [observation('orders', [{amount: 10}, {amount: -5}]), observation('note', 'batch')];
  const intent = new Intent({schema: {type: 'object', properties: {orders: {type: 'array', items: {type: 'object', properties: {amount: {type: 'number', minimum: 0}}, required: ['amount']}}, note: {type: 'string'}}}, executor: controlled(() => d)});
  try {const r = await intent.parse({input: 'A10 B-5 note=batch', fields: 'all'}); assert.deepEqual(r.effective.intents[0]!.inputs, {note: 'batch'}); assert.ok(r.issues.some(q => q.path === '/orders/1/amount')); assert.ok(r.fieldResults.some(f => f.path === '/orders/1/amount'));} finally {await intent.dispose();}
});
test('Open dependency domain yields undetermined, never falsely missing', async () => {
  const d = draft(); d.observations = [observation('discount', 5)]; const intent = new Intent({schema: {type: 'object', properties: {segment: {type: 'string'}, discount: {type: 'number'}}, if: {properties: {segment: {const: 'VIP'}}, required: ['segment']}, then: {properties: {discount: {maximum: 20}}}, else: {properties: {discount: {maximum: 10}}}}, executor: controlled(() => d)});
  try {assert.equal((await intent.parse({input: '优惠5', fields: ['discount']})).issues[0]!.code, 'FIELD_VALIDATION_UNDETERMINED');} finally {await intent.dispose();}
});
test('Actual validation budget stops before next invocation', () => {
  const validator = new BusinessValidator(), budget = new ValidationBudget(1);
  assert.equal(validator.validate({type: 'number'}, 5, budget).valid, true);
  assert.throws(() => validator.validate({type: 'number'}, 5, budget), {code: 'RESOURCE_LIMIT'}); assert.equal(budget.used, 1); validator.close();
});
test('Native budget resource failure is not semantic unknown', async () => {
  const d = draft(); d.observations = [observation('discount', 5)]; const intent = new Intent({schema: vip, executor: controlled(() => d), limits: {maxValidationChecks: 1}});
  try {await assert.rejects(intent.parse({input: '优惠5', fields: ['discount']}), (e: unknown) => e instanceof IntentError && e.code === 'RESOURCE_LIMIT' && e.stage === 'validation' && e.details?.limit === 'maxValidationChecks');} finally {await intent.dispose();}
});
test('PresenceUnknown includes Absent, PresentUnknown does not', () => {
  const schema = {type: 'object', properties: {flag: {type: 'boolean'}, discount: {type: 'number'}}, if: {required: ['flag']}, then: {properties: {discount: {maximum: 10}}}, else: {properties: {discount: {maximum: 0}}}};
  const definition = new Definition(schema, 262144, 64), validator = new BusinessValidator(); const rule = definition.plan('discount').rule;
  assert.equal(classify(rule, {discount: 5}, new Map([['flag', [false, true, ABSENT]]]), validator, new ValidationBudget(256)).status, 'unknown');
  assert.equal(classify(rule, {discount: 5}, new Map([['flag', [false, true]]]), validator, new ValidationBudget(256)).status, 'valid');
  assert.equal(classify(rule, {discount: 5}, new Map([['flag', [ABSENT]]]), validator, new ValidationBudget(256)).status, 'invalid'); validator.close();
});
test('oneOf remains atomic, independent unselected required does not block', () => {
  const validator = new BusinessValidator();
  const definition = new Definition({type: 'object', properties: {orderId: {type: 'string'}, note: {type: 'string'}}, required: ['orderId', 'note']}, 262144, 64);
  assert.equal(validator.validate(definition.plan('orderId').rule, {orderId: '000123'}, new ValidationBudget(256)).valid, true);
  const one = new Definition({type: 'object', properties: {discount: {type: 'number'}}, oneOf: [{properties: {discount: {minimum: 0}}}, {properties: {discount: {maximum: 10}}}]}, 262144, 64);
  assert.equal(validator.validate(one.plan('discount').rule, {discount: 5}, new ValidationBudget(256)).valid, false); validator.close();
});
test('True schema-dsl tracked s and full Builder strict/required metadata', () => {
  assert.equal(schemaSnapshot(s({id: 'string!'}), 262144, 64).type, 'object');
  const builder = new ObjectDslBuilder({type: 'object', properties: {a: {type: 'string'}, b: {type: 'string'}}}).strict().requireAll();
  const snap = schemaSnapshot(builder, 262144, 64); assert.equal(snap.strictSchema, true); assert.equal(snap.requiredAll, true);
  const definition = new Definition(snap, 262144, 64), validator = new BusinessValidator();
  assert.equal(validator.validate(definition.plan('a').rule, {a: 'x'}, new ValidationBudget(256)).valid, true);
  assert.equal(validator.validate(definition.plan('a').rule, {}, new ValidationBudget(256)).valid, false);
  assert.equal(validator.validate(definition.plan('a').rule, {a: 'x', extra: 1}, new ValidationBudget(256)).valid, false); validator.close();
});
test('Real declarative s.if/match retain validation rules', () => {
  const definition = new Definition(schemaSnapshot(s({isVip: 'boolean', discount: s.if('isVip', 'number:0-20', 'number:0-10')}), 262144, 64), 262144, 64), validator = new BusinessValidator();
  assert.equal(validator.validate(definition.plan('discount').rule, {isVip: true, discount: 15}, new ValidationBudget(256)).valid, true);
  assert.equal(validator.validate(definition.plan('discount').rule, {isVip: false, discount: 15}, new ValidationBudget(256)).valid, false); validator.close();
});
test('nested $id resolves local fragment in original resource and never follows literal refs', () => {
  const schema = {type: 'object', properties: {box: {$id: 'box', type: 'object', definitions: {amount: {type: 'number', minimum: 0}}, properties: {amount: {$ref: '#/definitions/amount'}}}}, default: {$ref: 'https://external.invalid'}, examples: [{$ref: 'file:///secret'}]};
  const definition = new Definition(schema, 262144, 64), validator = new BusinessValidator();
  assert.equal(validator.validate(definition.plan('box').rule, {box: {amount: 10}}, new ValidationBudget(256)).valid, true);
  assert.equal(validator.validate(definition.plan('box').rule, {box: {amount: -1}}, new ValidationBudget(256)).errors[0]!.path, '/box/amount'); validator.close();
});
for (const schema of [{type: 'object', properties: {}, $ref: 'https://external.invalid'}, {type: 'object', properties: {x: {$ref: '#/properties/x'}}}, {type: 'object', properties: {}, $defs: {}}] as IntentSchema[]) test('Unsupported remote/recursive/dialect declarations fail in config', () => assert.throws(() => new Intent({schema}), {code: 'SCHEMA_UNSUPPORTED_FOR_EXTRACTION'}));
test('Builder getter and ordinary Context Proxy never execute', async () => {
  let calls = 0; const builder = new ObjectDslBuilder({type: 'object', properties: {}});
  const raw = (builder as unknown as {_schema: {properties: object}})._schema; Object.defineProperty(raw.properties, 'danger', {enumerable: true, get() {calls++; return {};}});
  assert.throws(() => new Intent({schema: builder})); assert.equal(calls, 0);
  const intent = new Intent({executor: controlled(() => draft())});
  try {await assert.rejects(intent.parse({input: 'test', context: new Proxy({}, {ownKeys() {calls++; return [];}})}), {code: 'INPUT_INVALID'}); assert.equal(calls, 0);} finally {await intent.dispose();}
});
test('JSON DAG charges expanded bytes, preserves special keys, rejects cycles', () => {
  const shared = {x: '😀'}, value = {a: shared, b: shared}; const bytes = Buffer.byteLength(JSON.stringify(value));
  const opts = {maxBytes: bytes, maxDepth: 4, limit: 'maxContextBytes', stage: 'input' as const}; assert.equal(measure(value, opts), bytes); assert.throws(() => measure(value, {...opts, maxBytes: bytes - 1}), {code: 'RESOURCE_LIMIT'});
  const special = JSON.parse('{"__proto__":{"value":1},"constructor":false}'); assert.equal(JSON.stringify(snapshot(special, {...opts, maxBytes: Buffer.byteLength(JSON.stringify(special))})), JSON.stringify(special));
  const loop: Record<string, unknown> = {}; loop.loop = loop; assert.throws(() => snapshot(loop, opts), {code: 'INPUT_INVALID'});
});
test('Missing/default/null/false/0 remain distinct and do not coerce', async () => {
  const d = draft(); d.observations = [observation('note', null), observation('flag', false), observation('amount', 0)];
  const intent = new Intent({schema: {type: 'object', properties: {note: {type: ['null', 'string']}, flag: {type: 'boolean'}, amount: {type: 'number'}, currency: {type: 'string', default: 'USD'}}}, executor: controlled(() => d)});
  try {const r = await intent.parse({input: 'note=null flag=false amount=0', fields: 'all'}); assert.deepEqual(r.effective.intents[0]!.inputs, {note: null, flag: false, amount: 0}); assert.equal(r.fieldResults.find(f => f.field === 'currency')!.status, 'not_provided');} finally {await intent.dispose();}
});
test('Raw input and freely named context are independently snapshotted', async () => {
  let proceed!: () => void; const waiting = new Promise<void>(resolve => {proceed = resolve;}); let captured: unknown;
  const config: IntentConfig = {language: 'zh-CN', executor: {id: 'paused', async generate(request) {captured = request.input; await waiting; return {outcome: 'complete', text: JSON.stringify(draft())};}}};
  const intent = new Intent(config); const context = {chatLog: [{who: 'human', say: 'unchanged'}]}; const promise = intent.parse({input: 'test', context}); context.chatLog[0]!.say = 'changed'; config.language = 'en'; proceed();
  try {const r = await promise; assert.equal(r.input, 'test'); assert.equal((captured as {request: {context: typeof context}}).request.context.chatLog[0]!.say, 'unchanged');} finally {await intent.dispose();}
});
test('Cancellation of uncooperative executor retains physical slot; dispose does not hang', async () => {
  let finish!: (value: {outcome: 'complete'; text: string}) => void; const waiting = new Promise<{outcome: 'complete'; text: string}>(resolve => {finish = resolve;});
  const intent = new Intent({limits: {maxConcurrentParses: 1}, executor: {id: 'uncooperative', generate: () => waiting}}); const controller = new AbortController();
  const running = intent.parse({input: 'test'}, {signal: controller.signal}); controller.abort(); await assert.rejects(running, {code: 'REQUEST_ABORTED'});
  await assert.rejects(intent.parse({input: 'other'}), {code: 'RESOURCE_LIMIT'}); await intent.dispose(); finish({outcome: 'complete', text: JSON.stringify(draft())}); await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(intent.parse({input: 'after'}), {code: 'INSTANCE_DISPOSED'});
});
for (const [outcome, expected] of [['refusal', 'MODEL_REFUSED'], ['incomplete', 'MODEL_OUTPUT_INCOMPLETE']] as const) test('Model ' + outcome + ' never becomes success', async () => {
  const intent = new Intent({executor: {id: 'failure', async generate() {return {outcome};}}}); try {await assert.rejects(intent.parse({input: 'test'}), {code: expected});} finally {await intent.dispose();}
});
test('Duplicate JSON keys and full Result instead of candidate are rejected', async () => {
  let text = '{"version":"candidate-2","version":"candidate-2"}'; const intent = new Intent({executor: {id: 'bad', async generate() {return {outcome: 'complete', text};}}});
  try {await assert.rejects(intent.parse({input: 'test'}), {code: 'MODEL_OUTPUT_INVALID'}); text = JSON.stringify({schemaVersion: '2.0-draft.6', effective: {}}); await assert.rejects(intent.parse({input: 'test'}), {code: 'MODEL_OUTPUT_INVALID'});} finally {await intent.dispose();}
});
test('Error serialization excludes cause and user-controlled messages', () => {const e = new IntentError('INTERNAL_PROCESSING_FAILED', {cause: new Error('SECRET')}); assert.equal(Object.keys(e).includes('cause'), false); assert.equal(JSON.stringify(e).includes('SECRET'), false); assert.equal(JSON.stringify(e).includes('stack'), false); assert.equal(INTENT_RESULT_SCHEMA.$schema, 'http://json-schema.org/draft-07/schema#');});
test('Early saturated byte admission never reports a fabricated full observed size', () => {
  assert.throws(() => measure({large: 'x'.repeat(10000)}, {maxBytes: 5, maxDepth: 64, limit: 'maxContextBytes', stage: 'input'}), (error: unknown) => error instanceof IntentError && error.code === 'RESOURCE_LIMIT' && error.details?.allowed === 5 && error.details?.observed === undefined);
});
