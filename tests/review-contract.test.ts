import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Intent, IntentError, type IntentConfig, type IntentSchema } from '../src/index.js';
import { draft, observation, controlled, src } from './helpers.js';
import { retain } from './helpers.js';
import { BusinessValidator, ValidationBudget } from '../src/schema/validate.js';
import {ContractValidator} from '../src/internal/contracts.js';
import {INTENT_RESULT_SCHEMA} from '../src/contracts/generated.js';

test('R3 empty temporary identity cannot make null ownership refer to an actual node', async () => {
  const d = draft(['']); d.constraints = [{key: 'c', priorRef: null, ownerKey: null, scope: 'intent', referenceKey: null, kind: 'prohibition', text: '不要修改代码', expressionJson: null, sources: [src]}];
  const intent = new Intent({executor: controlled(() => d)});
  try {await assert.rejects(intent.parse({input: '分析，不修改代码'}), {code: 'MODEL_OUTPUT_INVALID', stage: 'validation'});} finally {await intent.dispose();}
});

test('R3 identity validation still permits a legitimate empty business property name', async () => {
  const d = draft(); d.observations = [observation('', 1)];
  const intent = new Intent({schema: {type: 'object', properties: {'': {type: 'number'}}}, executor: controlled(() => d)});
  try {const r = await intent.parse({input: '空属性名的值为1', fields: ['']}); assert.equal(r.effective.intents[0]!.inputs[''], 1); assert.equal(r.fieldResults[0]!.path, '/');} finally {await intent.dispose();}
});

for (const code of ['PROCESSING_INCOMPLETE', 'MODEL_TIMEOUT', 'INTERNAL_PROCESSING_FAILED', 'REQUEST_ABORTED']) test('R3 technical failure cannot be disguised as a normal result issue: ' + code, async () => {
  const d = draft(); d.issues = [{key: 'failure', ownerKey: null, fieldTarget: null, code, category: 'context', message: 'Processing did not complete', sources: [src], candidates: [], questions: []}];
  const intent = new Intent({executor: controlled(() => d)});
  try {await assert.rejects(intent.parse({input: '分析请求'}), {code: 'MODEL_OUTPUT_INVALID', stage: 'validation'});} finally {await intent.dispose();}
});

test('R3 a reserved error word remains legitimate literal business data', async () => {
  const d = draft(); d.observations = [observation('errorCode', 'MODEL_TIMEOUT')];
  const intent = new Intent({schema: {type: 'object', properties: {errorCode: {type: 'string'}}}, executor: controlled(() => d)});
  try {const r = await intent.parse({input: '分析 MODEL_TIMEOUT', fields: ['errorCode']}); assert.equal(r.effective.intents[0]!.inputs.errorCode, 'MODEL_TIMEOUT');} finally {await intent.dispose();}
});

test('R4 a pathological declared expression path is isolated in the cancellable worker', async () => {
  const d = draft(); d.constraints = [{key: 'c', priorRef: null, ownerKey: 'a', scope: 'intent', referenceKey: null, kind: 'requirement', text: '按给定字段条件理解', sources: [src], expressionJson: JSON.stringify({type: 'comparison', left: {type: 'input', intentId: 'a', path: '/bag/' + 'a'.repeat(28) + '!'}, operator: 'eq', right: {type: 'literal', value: 1}})}];
  const intent = new Intent({schema: {type: 'object', properties: {bag: {type: 'object', properties: {}, patternProperties: {'^(a+)+$': {type: 'number'}}}}}, timeoutMs: 10, executor: controlled(() => d)});
  const started = performance.now();
  try {await assert.rejects(intent.parse({input: '按给定条件理解'}), {code: 'MODEL_TIMEOUT'}); assert(performance.now() - started < 1000, 'The schema regular expression blocked the main event loop.');} finally {await intent.dispose();}
});

test('R4 an explicit deadline also wins when a synchronous executor blocks then throws', async () => {
  const intent = new Intent({timeoutMs: 5, executor: {id: 'synchronous-failure', async generate() {const until = performance.now() + 20; while (performance.now() < until) {} throw new Error('Late failure');}}});
  try {await assert.rejects(intent.parse({input: '分析'}), {code: 'MODEL_TIMEOUT'});} finally {await intent.dispose();}
});

// Frozen expectations: Usage Contract v0.7 §§3.2/3.4/4.4/6.5/6.6/6.8.
for (const [name, config] of [
  ['null language', {language: null}],
  ['null deadline', {timeoutMs: null}],
  ['semantics root null', {semantics: null}],
  ['semantics wrong domain', {semantics: {domain: 7}}],
  ['semantics missing action meaning', {semantics: {actions: [{name: 'query'}]}}],
  ['semantics empty term', {semantics: {terms: [{name: '', meaning: 'order'}]}}],
  ['semantics non-string examples', {semantics: {actions: [{name: 'query', meaning: 'query', examples: [4]}]}}],
  ['semantics conflicting names', {semantics: {actions: [{name: 'cancel', meaning: 'cancel shipment'}, {name: 'cancel', meaning: 'cancel payment'}]}}],
  ['unregistered language', {language: 'zz'}],
] as const) test('R1 rejects ' + name + ' in config', () => {
  assert.throws(() => new Intent(config as unknown as IntentConfig), {code: 'CONFIG_INVALID', stage: 'config'});
});

for (const language of ['zh-CN', 'de', 'qaa', 'x-example', 'en-u-ca-gregory']) test('R1 accepts registered/private/extension language ' + language, async () => {
  const intent = new Intent({language}); await intent.dispose();
});

test('R1 rejects a normalized invalid calendar date before calling model', async () => {
  let calls = 0; const intent = new Intent({executor: {id: 'observed', async generate() {calls++; return {outcome: 'complete', text: JSON.stringify(draft())};}}});
  try {await assert.rejects(intent.parse({input: '分析', referenceTime: '2026-02-30T10:00:00Z'}), {code: 'INPUT_INVALID', stage: 'input'}); assert.equal(calls, 0);} finally {await intent.dispose();}
});

test('R1 accepts a real CJS ObjectDslBuilder alongside the ESM core', async () => {
  const require = createRequire(path.resolve('package.json'));
  const real = require('schema-dsl/pure') as typeof import('schema-dsl/pure');
  const schema = new real.ObjectDslBuilder({type: 'object', properties: {orderId: {type: 'string'}}});
  const d = draft(); d.observations = [observation('orderId', '000123')];
  const intent = new Intent({schema, executor: controlled(() => d)});
  try {assert.equal((await intent.parse({input: '查询订单000123', fields: ['orderId']})).effective.intents[0]!.inputs.orderId, '000123');} finally {await intent.dispose();}
});

test('R1 charges the original declaration, not longer internal reference paths', async () => {
  const schema = {type: 'object', properties: {x: {$ref: '#/definitions/item'}}, definitions: {item: {type: 'string'}}} as IntentSchema;
  const maxSchemaBytes = Buffer.byteLength(JSON.stringify(schema));
  const d = draft(); d.observations = [observation('x', 'value')];
  const intent = new Intent({schema, limits: {maxSchemaBytes}, executor: controlled(() => d)});
  try {assert.equal((await intent.parse({input: 'value', fields: ['x']})).effective.intents[0]!.inputs.x, 'value');} finally {await intent.dispose();}
});

test('R2 follows transitive declared dependencies without extracting them', async () => {
  const schema = {type: 'object', properties: {x: {type: 'number'}, y: {type: 'boolean'}, z: {type: 'boolean'}}, dependencies: {x: ['y'], y: ['z']}} as IntentSchema;
  const d = draft(); d.observations = [observation('x', 1), observation('y', true)];
  const intent = new Intent({schema, executor: controlled(() => d)});
  try {const result = await intent.parse({input: 'x=1，y=true', fields: ['x']}); assert.equal(result.fieldResults[0]!.status, 'unknown'); assert.equal(Object.hasOwn(result.effective.intents[0]!.inputs, 'x'), false); assert(result.issues.some(i => i.code === 'FIELD_DEPENDENCY_MISSING'));} finally {await intent.dispose();}
});

test('R2 accepts transitive dependencies when all necessary values are known', async () => {
  const schema = {type: 'object', properties: {x: {type: 'number'}, y: {type: 'boolean'}, z: {type: 'boolean'}}, dependencies: {x: ['y'], y: ['z']}} as IntentSchema;
  const d = draft(); d.observations = [observation('x', 1), observation('y', true), observation('z', false)];
  const intent = new Intent({schema, executor: controlled(() => d)});
  try {const result = await intent.parse({input: 'x=1，y=true，z=false', fields: ['x']}); assert.deepEqual(result.effective.intents[0]!.inputs, {x: 1});} finally {await intent.dispose();}
});

test('R3 rejects input expressions that invent a field outside supplied definitions', async () => {
  const d = draft(); d.constraints = [{key: 'c', priorRef: null, ownerKey: 'a', scope: 'intent', referenceKey: null, kind: 'requirement', text: '按已给条件理解', expressionJson: JSON.stringify({type: 'comparison', left: {type: 'input', intentId: 'a', path: '/invented'}, operator: 'eq', right: {type: 'literal', value: true}}), sources: [src]}];
  const intent = new Intent({schema: {type: 'object', properties: {x: {type: 'boolean'}}}, executor: controlled(() => d)});
  try {await assert.rejects(intent.parse({input: '按已给条件理解'}), {code: 'MODEL_OUTPUT_INVALID', stage: 'validation'});} finally {await intent.dispose();}
});

test('R3 rejects unknown keys inside expression JSON as model output, not facility failure', async () => {
  const d = draft(); d.constraints = [{key: 'c', priorRef: null, ownerKey: 'a', scope: 'intent', referenceKey: null, kind: 'requirement', text: '条件', expressionJson: JSON.stringify({type: 'comparison', extra: 'invalid', left: {type: 'literal', value: 1}, operator: 'eq', right: {type: 'literal', value: 1}}), sources: [src]}];
  const intent = new Intent({executor: controlled(() => d)});
  try {await assert.rejects(intent.parse({input: '条件'}), {code: 'MODEL_OUTPUT_INVALID', stage: 'validation'});} finally {await intent.dispose();}
});

test('R3 requires a remove delta to actually be reflected in the authoritative object', async () => {
  const d = draft(); d.changes[0]!.deltaHints = [{path: '/goal', operation: 'remove'}];
  const intent = new Intent({executor: controlled(() => d)});
  try {await assert.rejects(intent.parse({input: '查询订单'}), {code: 'MODEL_OUTPUT_INVALID'});} finally {await intent.dispose();}
});

test('R3 rejects duplicate issues and retains an explicit source of the failure', async () => {
  const d = draft(); const q = {key: 'q', ownerKey: null, fieldTarget: null, code: 'CONTEXT_INCOMPLETE', category: 'context' as const, message: '历史不足', sources: [src], candidates: [], questions: []}; d.issues = [q, {...q}];
  const intent = new Intent({executor: controlled(() => d)});
  try {await assert.rejects(intent.parse({input: '继续'}), {code: 'MODEL_OUTPUT_INVALID'});} finally {await intent.dispose();}
});

test('R3 converts suggestion references to known public identities', async () => {
  const d = draft(); d.suggestions = [{kind: 'semantic_improvement', text: '明确对象', relatesTo: ['a']}];
  const intent = new Intent({executor: controlled(() => d)});
  try {const result = await intent.parse({input: '查询订单', output: {suggestions: true}}); assert.deepEqual(result.suggestions![0]!.relatesTo, [result.effective.intents[0]!.id]);} finally {await intent.dispose();}
});

test('R3 rejects suggestions that refer to nonexistent intents or issues', async () => {
  const d = draft(); d.suggestions = [{kind: 'clarification', text: '澄清对象', relatesTo: ['missing']}];
  const intent = new Intent({executor: controlled(() => d)});
  try {await assert.rejects(intent.parse({input: '查询订单', output: {suggestions: true}}), {code: 'MODEL_OUTPUT_INVALID'});} finally {await intent.dispose();}
});

test('R3 unresolved changes require their corresponding semantic issue', async () => {
  const d = draft([]); d.kind = 'withdrawal'; d.changes = [{operation: 'withdraw', effect: 'unresolved', targetKind: 'unresolved', targetKey: null, conditionKey: null, description: '取消哪个对象不清楚', sources: [src], deltaHints: []}];
  const intent = new Intent({executor: controlled(() => d)});
  try {const result = await intent.parse({input: '取消那个'}); assert.equal(result.status, 'partial'); assert(result.issues.some(i => i.category === 'ambiguity' || i.category === 'missing')); assert(result.effective.unresolved.length > 0);} finally {await intent.dispose();}
});

test('R2 newly provided dependency invalidates an old value even when absent from baseline inputs', async () => {
  const schema = {type: 'object', properties: {isVip: {type: 'boolean'}, discount: {type: 'number'}}, if: {properties: {isVip: {const: true}}, required: ['isVip']}, then: {properties: {discount: {maximum: 20}}}, else: {properties: {discount: {maximum: 10}}}} as IntentSchema;
  let d = draft(); d.observations = [observation('isVip', true), observation('discount', 15)];
  const intent = new Intent({schema, executor: controlled(() => d)});
  try {
    const first = await intent.parse({input: 'VIP=true，优惠15', fields: ['discount']}); assert.deepEqual(first.effective.intents[0]!.inputs, {discount: 15});
    d = retain(draft()); d.observations = [observation('isVip', false)];
    const next = await intent.parse({input: '改为非VIP', fields: ['isVip'], baseline: first.effective});
    assert.deepEqual(next.effective.intents[0]!.inputs, {isVip: false}); assert(next.fieldResults.some(f => f.field === 'discount' && f.status === 'invalidated' && f.trigger === 'invalidation'));
  } finally {await intent.dispose();}
});

const rules: Array<[string, IntentSchema, unknown, boolean]> = [
  ['tuple-valid', {type: 'array', items: [{type: 'number'}, {type: 'string'}], additionalItems: false}, [1, 'x'], true],
  ['tuple-invalid', {type: 'array', items: [{type: 'number'}, {type: 'string'}], additionalItems: false}, [1, 2], false],
  ['tuple-extra', {type: 'array', items: [{type: 'number'}], additionalItems: false}, [1, 2], false],
  ['contains-valid', {type: 'array', contains: {const: 'x'}}, ['y', 'x'], true],
  ['contains-invalid', {type: 'array', contains: {const: 'x'}}, ['y'], false],
  ['unique-invalid', {type: 'array', uniqueItems: true}, [1, 1], false],
  ['empty-array', {type: 'array', minItems: 0}, [], true],
  ['array-too-short', {type: 'array', minItems: 1}, [], false],
  ['dynamic-valid', {type: 'object', properties: {}, patternProperties: {'^a': {type: 'number', minimum: 0}}, additionalProperties: false}, {amount: 2}, true],
  ['dynamic-invalid', {type: 'object', properties: {}, patternProperties: {'^a': {type: 'number', minimum: 0}}, additionalProperties: false}, {amount: -1}, false],
  ['dynamic-extra', {type: 'object', properties: {}, patternProperties: {'^a': {type: 'number'}}, additionalProperties: false}, {other: 2}, false],
  ['propertyNames-valid', {type: 'object', propertyNames: {pattern: '^[a-z]+$'}}, {amount: 2}, true],
  ['propertyNames-invalid', {type: 'object', propertyNames: {pattern: '^[a-z]+$'}}, {'a/b': 2}, false],
  ['strict-valid', {type: 'object', properties: {a: {type: 'string'}}, strictSchema: true, requiredAll: true}, {a: 'x'}, true],
  ['strict-extra', {type: 'object', properties: {a: {type: 'string'}}, strictSchema: true}, {a: 'x', extra: 3}, false],
  ['requiredAll-missing', {type: 'object', properties: {a: {type: 'string'}}, requiredAll: true}, {}, false],
  ['nullable-null', {type: ['string', 'null']}, null, true],
  ['enum-valid', {enum: [0, false, null]}, false, true],
  ['enum-invalid', {enum: [0, false, null]}, '', false],
  ['const-false', {const: false}, false, true],
  ['multipleOf-invalid', {type: 'number', multipleOf: 0.5}, 1.3, false],
  ['pattern-invalid', {type: 'string', pattern: '^0[0-9]+$'}, '123', false],
  ['nested-bool-false', false as unknown as IntentSchema, 3, false],
];

for (const [name, rule, value, expected] of rules) test('R2 full declared nested rule through real Validator and Native: ' + name, async () => {
  const schema = {type: 'object', properties: {x: rule}} as IntentSchema;
  const oracle = new BusinessValidator();
  try {assert.equal(oracle.validate(schema, {x: value}, new ValidationBudget(256)).valid, expected);} finally {oracle.close();}
  const d = draft(); d.observations = [observation('x', value)];
  const intent = new Intent({schema, executor: controlled(() => d)});
  try {
    const result = await intent.parse({input: JSON.stringify(value), fields: ['x']});
    assert.equal(result.fieldResults[0]!.status, expected ? value === null ? 'explicit_null' : 'present' : 'invalid');
    assert.equal(Object.hasOwn(result.effective.intents[0]!.inputs, 'x'), expected);
    if (expected) assert.deepEqual(result.effective.intents[0]!.inputs.x, value);
  } finally {await intent.dispose();}
});

test('R4 explicit deadline is enforced when synchronous executor work delays the timer', async () => {
  const intent = new Intent({timeoutMs: 5, executor: {id: 'blocking-but-finite', async generate() {const end = performance.now() + 25; while (performance.now() < end) {} return {outcome: 'complete', text: JSON.stringify(draft())};}}});
  try {await assert.rejects(intent.parse({input: '分析'}), {code: 'MODEL_TIMEOUT'});} finally {await intent.dispose();}
});

test('R4 default zero deadline permits the same finite slow executor', async () => {
  const intent = new Intent({executor: {id: 'blocking-but-finite', async generate() {const end = performance.now() + 25; while (performance.now() < end) {} return {outcome: 'complete', text: JSON.stringify(draft())};}}});
  try {assert.equal((await intent.parse({input: '分析'})).status, 'complete');} finally {await intent.dispose();}
});

test('R3 disabled evidence does not permit a fabricated source or target in the candidate', async () => {
  const d = draft(); d.evidence = [{target: {kind: 'intent', key: 'a', path: '/goal'}, sources: [{root: 'context', pointer: '/notProvided'}]}];
  const intent = new Intent({executor: controlled(() => d)});
  try {await assert.rejects(intent.parse({input: '分析', output: {evidence: false}}), {code: 'MODEL_OUTPUT_INVALID'});} finally {await intent.dispose();}
});

test('R3 malformed inference JSON is a candidate violation', async () => {
  const d = draft(); d.inferences = [{target: {kind: 'intent', key: 'a', path: '/target'}, candidateJson: '{bad}', explanation: '对象未知', sources: [src]}];
  const intent = new Intent({executor: controlled(() => d)});
  try {await assert.rejects(intent.parse({input: '分析'}), {code: 'MODEL_OUTPUT_INVALID', stage: 'validation'});} finally {await intent.dispose();}
});

test('R4 preserves an API response body resource error through the shared Native core', async () => {
  let calls = 0;
  const intent = new Intent({executor: {id: 'bounded-api-boundary', async generate() {calls++; throw new IntentError('RESOURCE_LIMIT', {stage: 'model', details: {limit: 'maxResponseBytes', allowed: 11, observed: 12, unit: 'bytes'}});}}});
  try {await assert.rejects(intent.parse({input: '分析'}), (e: unknown) => e instanceof IntentError && e.code === 'RESOURCE_LIMIT' && e.stage === 'model' && e.details?.limit === 'maxResponseBytes'); assert.equal(calls, 1);} finally {await intent.dispose();}
});

test('R1 combined material overflow identifies /materials', async () => {
  const intent = new Intent({limits: {maxRequestBytes: 64}, executor: controlled(() => draft())});
  try {await assert.rejects(intent.parse({input: '分析'}), (e: unknown) => e instanceof IntentError && e.code === 'RESOURCE_LIMIT' && e.details?.limit === 'maxRequestBytes' && e.details.path === '/materials');} finally {await intent.dispose();}
});

test('R1 context overflow identifies the actual public material root', async () => {
  const intent = new Intent({limits: {maxContextBytes: 5}, executor: controlled(() => draft())});
  try {await assert.rejects(intent.parse({input: '分析', context: {a: 1}}), (e: unknown) => e instanceof IntentError && e.code === 'RESOURCE_LIMIT' && e.details?.path === '/context');} finally {await intent.dispose();}
});

test('R1 validates the registered extlang prefix', () => assert.throws(() => new Intent({language: 'en-cmn'}), {code: 'CONFIG_INVALID'}));
test('R1 accepts the registered extlang with its prefix', async () => {const intent = new Intent({language: 'zh-cmn-Hans-CN'}); await intent.dispose();});

test('R2 cannot omit Absent based on a presence claim without material evidence', async () => {
  const d = draft(); d.observations = [observation('flag', undefined, 'a', 'inputs', 'present_unknown'), observation('x', 5)];
  const schema = {type: 'object', properties: {flag: {type: 'boolean'}, x: {type: 'number'}}, if: {required: ['flag']}, then: {properties: {x: {maximum: 10}}}, else: {properties: {x: {maximum: 0}}}} as IntentSchema;
  const intent = new Intent({schema, executor: controlled(() => d)});
  try {await assert.rejects(intent.parse({input: 'x=5', fields: ['x']}), {code: 'MODEL_OUTPUT_INVALID'});} finally {await intent.dispose();}
});

test('R2 preserves the exact legal result when presence has a supplied source', async () => {
  const d = draft(); const flag = observation('flag', undefined, 'a', 'inputs', 'present_unknown'); flag.sources = [{root: 'input', pointer: '', quote: 'flag已存在'}]; d.observations = [flag, observation('x', 5)];
  const schema = {type: 'object', properties: {flag: {type: 'boolean'}, x: {type: 'number'}}, if: {required: ['flag']}, then: {properties: {x: {maximum: 10}}}, else: {properties: {x: {maximum: 0}}}} as IntentSchema;
  const intent = new Intent({schema, executor: controlled(() => d)});
  try {const result = await intent.parse({input: 'flag已存在但值未知，x=5', fields: ['x']}); assert.deepEqual(result.effective.intents[0]!.inputs, {x: 5});} finally {await intent.dispose();}
});

test('R3 local reference identities use tuples, so colon-containing keys do not collide', async () => {
  const d = draft(['a:b', 'a']);
  d.references = [{key: 'c', ownerKey: 'a:b', priorRef: null, kind: 'entity', intentKey: null, entityRef: 'R1', resolved: true, description: null, sources: [src]}, {key: 'b:c', ownerKey: 'a', priorRef: null, kind: 'entity', intentKey: null, entityRef: 'R2', resolved: true, description: null, sources: [src]}];
  const intent = new Intent({executor: controlled(() => d)});
  try {const result = await intent.parse({input: 'A引用R1，B引用R2'}); assert.equal(result.effective.intents[0]!.references[0]!.ref, 'R1'); assert.equal(result.effective.intents[1]!.references[0]!.ref, 'R2');} finally {await intent.dispose();}
});

test('R3 field report identities do not collide for supplied IDs and nested JSON paths', async () => {
  const d = draft(['a', 'b']); d.usedHistory = true; d.kind = 'amendment';
  d.nodes[0]!.priorRef = {root: 'context', pointer: '/goals/0'}; d.nodes[1]!.priorRef = {root: 'context', pointer: '/goals/1'};
  d.changes = []; d.observations = [observation('y', -1, 'a'), observation('x:', {y: -1}, 'b')];
  const schema = {type: 'object', properties: {y: {type: 'number', minimum: 0}, 'x:': {type: 'object', properties: {y: {type: 'number', minimum: 0}}}}} as IntentSchema;
  const intent = new Intent({schema, executor: controlled(() => d)});
  try {const result = await intent.parse({input: '两项目数值分别为-1', fields: 'all', context: {goals: [{id: 'a:/x', goal: 'A'}, {id: 'a', goal: 'B'}]}}); assert(result.fieldResults.some(f => f.intentId === 'a:/x' && f.path === '/y')); assert(result.fieldResults.some(f => f.intentId === 'a' && f.path === '/x:/y'));} finally {await intent.dispose();}
});

test('R4 bounds a flat candidate becoming a deep tree before public Validator work', async () => {
  const d = draft(Array.from({length: 80}, (_, i) => 'node' + i));
  d.nodes.forEach((n, i) => {n.parentKey = i ? 'node' + (i - 1) : null;});
  const original = ContractValidator.prototype.valid; let outputChecks = 0;
  ContractValidator.prototype.valid = function(schema, value) {if (schema === INTENT_RESULT_SCHEMA) outputChecks++; return original.call(this, schema, value);};
  const intent = new Intent({limits: {maxDepth: 8}, executor: controlled(() => d)});
  try {await assert.rejects(intent.parse({input: '80层明确子目标'}), (e: unknown) => e instanceof IntentError && e.code === 'RESOURCE_LIMIT' && e.stage === 'output' && e.details?.limit === 'maxDepth'); assert.equal(outputChecks, 0);} finally {ContractValidator.prototype.valid = original; await intent.dispose();}
});

test('R4 bounds repeated delta expansion before public Validator work', async () => {
  const d = draft(); d.nodes[0]!.goal = '明确目标'.repeat(200); d.changes[0]!.deltaHints = Array.from({length: 20}, () => ({path: '/goal', operation: 'set' as const}));
  const maxOutputBytes = Buffer.byteLength(JSON.stringify(d)) + 500;
  const original = ContractValidator.prototype.valid; let outputChecks = 0;
  ContractValidator.prototype.valid = function(schema, value) {if (schema === INTENT_RESULT_SCHEMA) outputChecks++; return original.call(this, schema, value);};
  const intent = new Intent({limits: {maxOutputBytes}, executor: controlled(() => d)});
  try {await assert.rejects(intent.parse({input: '保留目标'}), (e: unknown) => e instanceof IntentError && e.code === 'RESOURCE_LIMIT' && e.stage === 'output'); assert.equal(outputChecks, 0);} finally {ContractValidator.prototype.valid = original; await intent.dispose();}
});

test('R4 awaited disposal waits for its owned worker exit, without awaiting external services', async () => {
  const d = draft(); d.observations = [observation('x', 1)];
  const intent = new Intent({schema: {type: 'object', properties: {x: {type: 'number'}}}, executor: controlled(() => d)});
  await intent.parse({input: 'x=1', fields: ['x']});
  const worker = (intent as unknown as {runner: {worker: import('node:worker_threads').Worker}}).runner.worker;
  let exited = false; worker.once('exit', () => {exited = true;});
  await intent.dispose(); assert.equal(exited, true); await intent.dispose();
});
