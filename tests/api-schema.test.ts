import test from 'node:test';
import assert from 'node:assert/strict';
import { compileOpenAiOutput, OPENAI_WIRE_INSTRUCTIONS } from '../src/adapters/openai-schema.js';
import { createApiExecutor } from '../src/adapters/api.js';
import { CANDIDATE_SCHEMA } from '../src/contracts/generated.js';
import { Intent, IntentError, type ModelRequest } from '../src/index.js';
import { ContractValidator } from '../src/internal/contracts.js';
import { draft } from './helpers.js';

const source = {type: 'object', properties: {root: {type: 'string', enum: ['input', 'context']}, pointer: {type: 'string'}, quote: {type: 'string'}}, required: ['root', 'pointer'], additionalProperties: false};
const object = (properties: Record<string, object>) => ({type: 'object', properties, required: Object.keys(properties), additionalProperties: false});
const request = (outputSchema: object): ModelRequest => ({instructions: 'Supplied instruction', input: {}, outputSchema, signal: new AbortController().signal});
const invalid = (code: string) => (error: unknown) => error instanceof IntentError && error.code === code;

const wireDiagnostic = () => {
  const value = JSON.parse(/would be:\n([^\n]+)/.exec(OPENAI_WIRE_INSTRUCTIONS)![1]!);
  value.issues = [{key: 'field-claim', ownerKey: 'n1', fieldTarget: {container: 'inputs', field: 'recordId', path: '/recordId'}, category: 'data', code: 'FIELD_VALUE_INVALID', message: 'The declared value is invalid.', sources: [{root: 'input', pointer: '', quote: null}], candidates: [{key: 'local', description: 'A possible correction', intentKey: 'n1', sources: [{root: 'input', pointer: '', quote: null}]}], questions: [{question: 'Which correction?', optionKeys: ['local']}]}];
  return value;
};

test('Actual private issue variants retain nullable-quote registration and opaque JSON values', () => {
  const value = wireDiagnostic(); value.observations[0].valueJson = 'null';
  const codec = compileOpenAiOutput(CANDIDATE_SCHEMA);
  try {
    const decoded = JSON.parse(codec.decode(JSON.stringify(value)));
    assert.equal(decoded.observations[0].valueJson, 'null'); assert.equal(decoded.nodes[0].optional, null);
    assert.deepEqual(decoded.issues[0].sources, [{root: 'input', pointer: ''}]);
    assert.deepEqual(decoded.issues[0].candidates[0].sources, [{root: 'input', pointer: ''}]);
    assert.deepEqual(decoded.issues[0].questions[0].optionKeys, ['local']);
    value.issues[0].fieldTarget = null; value.issues[0].category = 'conflict'; value.issues[0].code = 'CONSTRAINT_CONFLICT';
    assert.equal(JSON.parse(codec.decode(JSON.stringify(value))).issues[0].fieldTarget, null);
  } finally {codec.close();}
});

for (const bad of ['category', 'code', 'missing-target']) test('Private issue branch rejects correlated field error: ' + bad, () => {
  const value = wireDiagnostic();
  if (bad === 'category') value.issues[0].category = 'conflict';
  else if (bad === 'code') value.issues[0].code = 'CONSTRAINT_CONFLICT';
  else value.issues[0].fieldTarget = null;
  const codec = compileOpenAiOutput(CANDIDATE_SCHEMA);
  try {assert.throws(() => codec.decode(JSON.stringify(value)), invalid('MODEL_OUTPUT_INVALID'));} finally {codec.close();}
});

for (const path of ['/inputs', '/extensions']) test('Private inference generation excludes authoritative container ' + path, () => {
  const value = wireDiagnostic(); value.issues = [];
  value.inferences = [{target: {kind: 'intent', key: 'n1', path}, candidateJson: '{}', explanation: 'Unconfirmed', sources: [{root: 'input', pointer: '', quote: null}]}];
  const codec = compileOpenAiOutput(CANDIDATE_SCHEMA);
  try {assert.throws(() => codec.decode(JSON.stringify(value)), invalid('MODEL_OUTPUT_INVALID'));} finally {codec.close();}
});

test('Derived issue variants still enforce the total property bound after refinement', () => {
  const value = structuredClone(CANDIDATE_SCHEMA) as any;
  const propertyCount = (node: any): number => !node || typeof node !== 'object' ? 0 : (node.properties ? Object.keys(node.properties).length : 0) + Object.values(node).reduce<number>((n, child) => n + propertyCount(child), 0);
  const count = 5000 - propertyCount(value); assert(count > 0);
  (value.definitions ?? value.$defs).extra = object(Object.fromEntries(Array.from({length: count}, (_, i) => ['bound' + i, {type: 'string'}])));
  assert.equal(propertyCount(value), 5000);
  assert.throws(() => compileOpenAiOutput(value), invalid('CONFIG_INVALID'));
});

for (const protocol of ['responses', 'chat-completions'] as const) test(protocol + ' carries private field claims through the real codec and shared core', async () => {
  const originalFetch = globalThis.fetch, value = wireDiagnostic(); value.observations[0].valueJson = '7'; let calls = 0;
  globalThis.fetch = async () => {
    calls++; const text = JSON.stringify(value);
    return new Response(JSON.stringify(protocol === 'responses' ? {status: 'completed', output: [{type: 'message', role: 'assistant', content: [{type: 'output_text', text}]}]} : {choices: [{finish_reason: 'stop', message: {role: 'assistant', content: text}}]}));
  };
  const intent = new Intent({schema: {type: 'object', properties: {recordId: {type: 'string'}}}, executor: createApiExecutor({provider: 'openai', protocol, model: 'controlled-fixture', apiKey: 'synthetic'})});
  try {
    const r = await intent.parse({input: 'Show the supplied record; do not delete it', fields: ['recordId']});
    assert.equal(calls, 1); assert.equal(r.issues.length, 1); assert.equal(r.issues[0]!.code, 'FIELD_VALUE_INVALID');
    assert.equal(r.issues[0]!.questions![0]!.optionIds![0], r.issues[0]!.candidates![0]!.id);
    assert(r.issues[0]!.sourceRefs!.every(ref => !Object.hasOwn(ref, 'quote')));
  } finally {globalThis.fetch = originalFetch; await intent.dispose();}
});

test('non-factual protocol example remains a valid wire candidate and real core example', async () => {
  const example = /would be:\n([^\n]+)/.exec(OPENAI_WIRE_INSTRUCTIONS)?.[1];assert(example);
  const codec = compileOpenAiOutput(CANDIDATE_SCHEMA);let text: string;
  try {text = codec.decode(example);} finally {codec.close();}
  const intent = new Intent({schema: {type: 'object', properties: {recordId: {type: 'string'}}}, executor: {id: 'protocol-example-fixture', async generate() {return {outcome: 'complete', text};}}});
  try {const result = await intent.parse({input: 'Show record A12, do not delete it', fields: ['recordId']});assert.equal(result.effective.intents[0]!.inputs.recordId, 'A12');assert(result.effective.intents[0]!.constraints.some(c => c.kind === 'prohibition'));}
  finally {await intent.dispose();}
});

test('multi-target protocol example preserves scalar field ownership through the real core', async () => {
  const example = /one target:\n([^\n]+)/.exec(OPENAI_WIRE_INSTRUCTIONS)?.[1];assert(example);
  const codec = compileOpenAiOutput(CANDIDATE_SCHEMA);let text: string;
  try {text = codec.decode(example);} finally {codec.close();}
  const intent = new Intent({schema: {type: 'object', properties: {recordId: {type: 'string'}}}, executor: {id: 'multi-target-protocol-fixture', async generate() {return {outcome: 'complete', text};}}});
  try {const result = await intent.parse({input: 'Show records A12 and B34 separately', fields: ['recordId']});assert.deepEqual(result.effective.intents.map(n => n.inputs.recordId), ['A12', 'B34']);}
  finally {await intent.dispose();}
});

test('complete candidate schema projects without mutating core and preserves all required constraints', () => {
  const before = JSON.stringify(CANDIDATE_SCHEMA), output = compileOpenAiOutput(CANDIDATE_SCHEMA);
  let count = 0;
  function walk(v: any): void {
    if (!v || typeof v !== 'object') return;
    assert.equal(v.allOf, undefined); assert.equal(v.definitions, undefined);
    if (v.type === 'object') {assert.deepEqual([...v.required].sort(), Object.keys(v.properties).sort()); assert.equal(v.additionalProperties, false); count++;}
    for (const child of Object.values(v)) walk(child);
  }
  try {walk(output.schema); assert(count > 16); assert.equal(JSON.stringify(CANDIDATE_SCHEMA), before); assert((output.schema as any).$defs);}
  finally {output.close();}
});

test('wire messages enforce the existing core nonblank invariant without inventing explanations', () => {
  const example = JSON.parse(/would be:\n([^\n]+)/.exec(OPENAI_WIRE_INSTRUCTIONS)![1]!);example.messages.open = ' \n ';
  const codec = compileOpenAiOutput(CANDIDATE_SCHEMA);
  try {assert.throws(() => codec.decode(JSON.stringify(example)), (e: unknown) => invalid('MODEL_OUTPUT_INVALID')(e) && (e as IntentError).details?.violations?.[0]?.path === '/messages/open');}
  finally {codec.close();}
});

test('registered nullable quote mapping is lossless across references, arrays and null unions', () => {
  const schema = {...object({refs: {type: 'array', items: {$ref: '#/definitions/source'}}, optionalRef: {anyOf: [source, {type: 'null'}]}, businessQuote: {type: ['string', 'null']}, valueJson: {type: 'string'}, candidateJson: {type: 'string'}, expressionJson: {type: 'string'}}), definitions: {source}};
  const before = structuredClone(schema), output = compileOpenAiOutput(schema);
  const wire = {refs: [{root: 'input', pointer: '', quote: null}, {root: 'input', pointer: '', quote: ''}, {root: 'context', pointer: '/x', quote: 'null'}, {root: 'input', pointer: '', quote: 'actual'}], optionalRef: null, businessQuote: null, valueJson: 'null', candidateJson: '{"quote":null}', expressionJson: '[null]'};
  const expected = {refs: [{root: 'input', pointer: ''}, {root: 'input', pointer: '', quote: ''}, {root: 'context', pointer: '/x', quote: 'null'}, {root: 'input', pointer: '', quote: 'actual'}], optionalRef: null, businessQuote: null, valueJson: 'null', candidateJson: '{"quote":null}', expressionJson: '[null]'};
  try {
    assert.deepEqual(JSON.parse(output.decode(JSON.stringify(wire))), expected);
    assert.deepEqual(schema, before); assert.equal((output.schema as any).properties.refs.items.$ref, '#/$defs/source');
    assert.deepEqual(wire.refs[0], {root: 'input', pointer: '', quote: null});
    const valid = new ContractValidator(); try {valid.candidate(schema, expected);} finally {valid.close();}
  } finally {output.close();}
});

for (const bad of ['{"root":"input","pointer":""}', '{"root":"input","pointer":"","quote":1}', '{"root":"input","pointer":"","quote":null,"path":"extra"}']) test('wire source rejects missing, wrong or extra property: ' + bad, () => {
  const output = compileOpenAiOutput(source); try {assert.throws(() => output.decode(bad), invalid('MODEL_OUTPUT_INVALID'));} finally {output.close();}
});

for (const bad of ['{"quote":null,"quote":"invented"}', '{"quote":null,"qu\\u006fte":"invented"}', '{', 'null']) test('codec cannot launder duplicate keys or invalid JSON: ' + bad, () => {
  const output = compileOpenAiOutput(source); try {assert.throws(() => output.decode(bad), invalid('MODEL_OUTPUT_INVALID'));} finally {output.close();}
});

test('codec rejects nested duplicate keys and bounds malformed depth before normalization', () => {
  const output = compileOpenAiOutput(object({refs: {type: 'array', items: source}}));
  try {
    assert.throws(() => output.decode('{"refs":[{"root":"input","pointer":"","quote":null,"quote":"x"}]}'), invalid('MODEL_OUTPUT_INVALID'));
    assert.throws(() => output.decode('{"refs":[[[[[[]]]]]]}'), invalid('RESOURCE_LIMIT'));
    assert.deepEqual(JSON.parse(output.decode(' '.repeat(10000) + '{"refs":[]}')), {refs: []});
  } finally {output.close();}
});

const unsupported: object[] = [
  {allOf: [{type: 'object'}, {type: 'object'}]},
  {allOf: [{anyOf: [{type: 'null'}, {type: 'string'}]}], description: 'sibling'},
  {type: 'object', properties: {optional: {type: 'string'}}, required: [], additionalProperties: false},
  object({x: {$ref: '#/definitions/missing'}}),
  object({x: {$ref: 'https://example.com/schema'}}),
  {...object({x: {$ref: '#/definitions/x'}}), definitions: {x: object({next: {$ref: '#/definitions/x'}})}},
  {...object({}), definitions: {}, $defs: {}},
  object({x: {type: 'string', minLength: 1}}),
];
for (const [i, schema] of unsupported.entries()) test('unsupported schema fails before fetch ' + i, async () => {
  const fetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => {calls++; throw new Error('must not fetch');};
  try {
    await assert.rejects(createApiExecutor({provider: 'openai', model: 'test', apiKey: 'synthetic'}).generate(request(schema)), (e: unknown) => invalid('CONFIG_INVALID')(e) && (e as IntentError).details?.path?.startsWith('/outputSchema') === true);
    assert.equal(calls, 0);
  } finally {globalThis.fetch = fetch;}
});

test('already-$defs references and escaped definition names remain resolvable', () => {
  const schema = {...object({items: {type: 'array', items: {$ref: '#/$defs/a~1b~0c'}}}), $defs: {'a/b~c': source}};
  const output = compileOpenAiOutput(schema);
  try {assert.deepEqual(JSON.parse(output.decode('{"items":[{"root":"input","pointer":"","quote":null}]}')), {items: [{root: 'input', pointer: ''}]});} finally {output.close();}
});

for (const [value, expected] of [[{}, '/relations'], [{relations: [], nodes: [{}]}, '/nodes/0/action']] as const) test('shared validator returns required-property pointer ' + expected, () => {
  const v = new ContractValidator();
  const schema = object({relations: {type: 'array', items: {type: 'string'}}, nodes: {type: 'array', items: object({action: {type: 'string'}})}});
  try {assert.throws(() => v.candidate(schema, value), (e: unknown) => invalid('MODEL_OUTPUT_INVALID')(e) && (e as IntentError).details?.violations?.[0]?.path === expected);} finally {v.close();}
});

test('shared validator escapes additional-property pointers and retains error shape', () => {
  const v = new ContractValidator();
  try {assert.throws(() => v.candidate(object({}), {'a/b~c': 1}), (e: unknown) => {
    assert(e instanceof IntentError); assert.deepEqual(e.details, {violations: [{rule: 'STRUCTURE', path: '/a~1b~0c'}]}); assert.equal(e.stage, 'validation'); return true;
  });} finally {v.close();}
});

test('shared fragment diagnostics keep the original opaque JSON-string slot', () => {
  const v = new ContractValidator();
  try {assert.throws(() => v.candidate(object({left: {type: 'string'}}), {}, '/constraints/0/expressionJson'), (e: unknown) => invalid('MODEL_OUTPUT_INVALID')(e) && (e as IntentError).details?.violations?.[0]?.path === '/constraints/0/expressionJson');} finally {v.close();}
});

for (const protocol of ['responses', 'chat-completions'] as const) test(protocol + ' preserves candidate errors and keeps HTTP/core limits distinct', async () => {
  const fetch = globalThis.fetch; let calls = 0, text = '{"relations":[],"relations":[]}';
  globalThis.fetch = async () => {calls++; return new Response(JSON.stringify(protocol === 'responses' ? {status: 'completed', output: [{type: 'message', role: 'assistant', content: [{type: 'output_text', text}]}]} : {choices: [{finish_reason: 'stop', message: {role: 'assistant', content: text}}]}));};
  const executor = createApiExecutor({provider: 'openai', protocol, model: 'test', apiKey: 'synthetic'});
  try {
    await assert.rejects(executor.generate(request(CANDIDATE_SCHEMA)), {code: 'MODEL_OUTPUT_INVALID', stage: 'validation'}); assert.equal(calls, 1);
    const invalidIntent = new Intent({executor});
    try {
      await assert.rejects(invalidIntent.parse({input: 'query'}), {code: 'MODEL_OUTPUT_INVALID', stage: 'validation'});
      text = '{"unknown":' + '['.repeat(20) + '0' + ']'.repeat(20) + '}';
      await assert.rejects(invalidIntent.parse({input: 'query'}), (e: unknown) => invalid('RESOURCE_LIMIT')(e) && (e as IntentError).stage === 'validation' && (e as IntentError).details?.limit === 'maxDepth');
    } finally {await invalidIntent.dispose();}
    text = '{}'; await assert.rejects(executor.generate(request(CANDIDATE_SCHEMA)), {code: 'MODEL_OUTPUT_INVALID', stage: 'validation'});
    const d = draft(['n1']); text = JSON.stringify({...d, nodes: d.nodes.map(n => ({...n, sources: [{root: 'input', pointer: '', quote: null}]})), changes: d.changes.map(c => ({...c, sources: [{root: 'input', pointer: '', quote: null}]}))});
    const intent = new Intent({executor, limits: {maxOutputBytes: 100}});
    try {await assert.rejects(intent.parse({input: 'query'}), (e: unknown) => invalid('RESOURCE_LIMIT')(e) && (e as IntentError).details?.limit === 'maxOutputBytes');} finally {await intent.dispose();}
  } finally {globalThis.fetch = fetch;}
});

test('Native keeps adapter schema configuration failures and never calls fetch', async () => {
  const fetch = globalThis.fetch;let calls = 0;
  globalThis.fetch = async () => {calls++; throw new Error('must not fetch');};
  const api = createApiExecutor({provider: 'openai', model: 'test', apiKey: 'synthetic'});
  const intent = new Intent({executor: {id: 'unsupported-wire-shape', generate: r => api.generate({...r, outputSchema: object({x: {$ref: 'https://example.com/schema'}})})}});
  try {await assert.rejects(intent.parse({input: 'query'}), (e: unknown) => invalid('CONFIG_INVALID')(e) && (e as IntentError).stage === 'config' && (e as IntentError).details?.path?.startsWith('/outputSchema') === true);assert.equal(calls, 0);}
  finally {await intent.dispose();globalThis.fetch = fetch;}
});

const protocol = () => JSON.parse(/would be:\n([^\n]+)/.exec(OPENAI_WIRE_INSTRUCTIONS)![1]!);
const codecCheck = (candidate: unknown): string => {const codec = compileOpenAiOutput(CANDIDATE_SCHEMA); try {return codec.decode(JSON.stringify(candidate));} finally {codec.close();}};

for (const [name, mutate] of [
  ['constraint in node keys', (d: any) => d.relatedKeys.push('c1')],
  ['new key with prior identity', (d: any) => d.nodes[0].priorRef = {root: 'baseline', pointer: '/intents/0', quote: null}],
  ['prior key without prior identity', (d: any) => d.nodes[0].key = 'p1'],
  ['input local quotation', (d: any) => d.nodes[0].sources[0].quote = 'A12'],
  ['input non-root pointer', (d: any) => d.nodes[0].sources[0].pointer = '/request/input'],
  ['resolved null target', (d: any) => {d.changes[0].targetKind = 'constraint'; d.changes[0].targetKey = null;}],
  ['business pointer as snapshot hint', (d: any) => d.changes[0].deltaHints.push({path: '/recordId', operation: 'set'})],
  ['unresolved target with applied effect', (d: any) => {d.changes[0].targetKind = 'unresolved'; d.changes[0].targetKey = null;}],
  ['conditional change without condition', (d: any) => d.changes[0].effect = 'conditional'],
  ['nonapplied delta hints', (d: any) => {d.changes[0].effect = 'unresolved'; d.changes[0].deltaHints.push({path: '/goal', operation: 'set'});} ],
  ['authoritative field inference', (d: any) => d.inferences.push({target: {kind: 'intent', key: 'n1', path: '/inputs/recordId'}, candidateJson: null, explanation: 'Not confirmed', sources: [{root: 'input', pointer: '', quote: null}]})],
] as Array<[string, (d: any) => void]>) test('candidate wire rejects ' + name + ' before canonical decoding', () => {
  const d = protocol(); mutate(d); assert.throws(() => codecCheck(d), invalid('MODEL_OUTPUT_INVALID'));
});

test('existing identity cannot be generated as an applied intent add', () => {
  const d = protocol();d.nodes[0].key = 'p1';d.nodes[0].priorRef = {root: 'baseline', pointer: '/intents/0', quote: null};d.relatedKeys = ['p1'];d.constraints[0].ownerKey = 'p1';d.observations[0].ownerKey = 'p1';d.changes[0].targetKey = 'p1';
  assert.throws(() => codecCheck(d), invalid('MODEL_OUTPUT_INVALID'));
  d.changes[0].operation = 'modify';assert.equal(JSON.parse(codecCheck(d)).nodes[0].priorRef.quote, undefined);
});

test('known target may remain unresolved and legitimate snapshot hints survive', () => {
  const d = protocol();d.changes.push({...d.changes[0], operation: 'modify', effect: 'unresolved'});
  assert.equal(JSON.parse(codecCheck(d)).changes.at(-1).targetKey, 'n1');
  d.changes.pop();
  for (const path of ['/inputs/recordId', '/references/0', '/expectedOutput', '/children/0/goal']) {
    d.changes[0].deltaHints = [{path, operation: 'remove'}];assert.equal(JSON.parse(codecCheck(d)).changes[0].deltaHints[0].path, path);
  }
});

test('wire keeps noninput literal quotations and evidence while restricting only inference field values', () => {
  const d = protocol();d.observations[0].sources = [{root: 'context', pointer: '/record', quote: 'A12'}];
  d.evidence = [{target: {kind: 'intent', key: 'n1', path: '/inputs/recordId'}, sources: [{root: 'input', pointer: '', quote: null}]}];
  d.inferences = [{target: {kind: 'intent', key: 'n1', path: '/target'}, candidateJson: '"possible"', explanation: 'Not confirmed', sources: [{root: 'context', pointer: '/record', quote: null}]}];
  const canonical = JSON.parse(codecCheck(d));assert.equal(canonical.observations[0].sources[0].quote, 'A12');assert.equal(canonical.evidence[0].target.path, '/inputs/recordId');assert.equal(canonical.inferences[0].target.path, '/target');assert.equal(canonical.nodes[0].sources[0].quote, undefined);
});

test('non-factual amendment example preserves identity and delegates old-value invalidation to real core', async () => {
  const amendment = JSON.parse(/One candidate would be:\n([^\n]+)/.exec(OPENAI_WIRE_INSTRUCTIONS)![1]!);
  const initial = protocol();initial.constraints = [];initial.changes = initial.changes.slice(0, 1);initial.nodes[0].action = 'deliver';initial.nodes[0].goal = 'Deliver record A12';
  initial.observations.push({...initial.observations[0], field: 'expedited', valueJson: 'true'}, {...initial.observations[0], field: 'allowance', valueJson: '7'});
  let current = initial;
  const intent = new Intent({schema: {type: 'object', properties: {recordId: {type: 'string'}, expedited: {type: 'boolean'}, allowance: {type: 'number'}}, if: {properties: {expedited: {const: true}}, required: ['expedited']}, then: {properties: {allowance: {maximum: 9}}}, else: {properties: {allowance: {maximum: 3}}}}, executor: {id: 'amendment-protocol-example', async generate() {return {outcome: 'complete', text: codecCheck(current)};}}});
  try {
    const first = await intent.parse({input: 'Deliver record A12 with expedited=true and allowance=7', fields: 'all'});current = amendment;
    const result = await intent.parse({input: 'Disable expedited delivery; keep the delivery goal', fields: ['expedited'], baseline: first.effective});
    assert.equal(result.effective.intents[0]!.id, first.effective.intents[0]!.id);assert.deepEqual(result.effective.intents[0]!.inputs, {recordId: 'A12', expedited: false});assert.equal(result.status, 'complete');assert.equal(result.effective.intents[0]!.understanding, 'clear');assert(result.fieldResults.some(f => f.field === 'allowance' && f.status === 'invalidated'));assert(result.issues.every(i => i.code === 'FIELD_INVALIDATED'));assert.deepEqual(result.inferences, []);assert.equal(result.turn.changes[0]!.operation, 'modify');
  } finally {await intent.dispose();}
});

test('shared core keeps arbitrary host keys and exact input quotes outside the OpenAI wire', async () => {
  const d = draft(['host/arbitrary~key']);d.nodes[0]!.sources = [{root: 'input', pointer: '', quote: 'record'}];
  const intent = new Intent({executor: {id: 'host-key-and-source', async generate() {return {outcome: 'complete', text: JSON.stringify(d)};}}});
  try {const result = await intent.parse({input: 'Show record'});assert.equal(result.status, 'complete');assert.equal(result.effective.intents.length, 1);}
  finally {await intent.dispose();}
});

for (const [name, mutate, expected] of [
  ['related node key', (d: any) => d.relatedKeys.push('c1'), '/relatedKeys/1'],
  ['delta snapshot path', (d: any) => d.changes[0].deltaHints.push({path: '/recordId', operation: 'set'}), '/changes/0/deltaHints/0/path'],
] as Array<[string, (d: any) => void, string]>) test('canonical core locates invalid ' + name + ' independently of wire restrictions', async () => {
  const d = JSON.parse(codecCheck(protocol()));mutate(d);
  const intent = new Intent({schema: {type: 'object', properties: {recordId: {type: 'string'}}}, executor: {id: 'canonical-negative', async generate() {return {outcome: 'complete', text: JSON.stringify(d)};}}});
  try {await assert.rejects(intent.parse({input: 'Show record A12 without deleting it', fields: ['recordId']}), (e: unknown) => invalid('MODEL_OUTPUT_INVALID')(e) && (e as IntentError).details?.violations?.[0]?.path === expected);}
  finally {await intent.dispose();}
});

test('canonical existing-object add diagnoses the operation rather than a missing aggregate change', async () => {
  let d = JSON.parse(codecCheck(protocol()));d.constraints = [];d.changes = d.changes.slice(0, 1);
  const intent = new Intent({schema: {type: 'object', properties: {recordId: {type: 'string'}}}, executor: {id: 'canonical-existing-add', async generate() {return {outcome: 'complete', text: JSON.stringify(d)};}}});
  try {
    const first = await intent.parse({input: 'Show record A12', fields: ['recordId']});
    d = {...d, kind: 'amendment', usedHistory: true};d.nodes[0].priorRef = {root: 'baseline', pointer: '/intents/0'};
    await assert.rejects(intent.parse({input: 'Modify record A12', fields: ['recordId'], baseline: first.effective}), (e: unknown) => invalid('MODEL_OUTPUT_INVALID')(e) && (e as IntentError).details?.violations?.[0]?.path === '/changes/0/operation' && (e as IntentError).details?.violations?.[0]?.rule === 'SEMANTIC_INVARIANT');
  } finally {await intent.dispose();}
});

for (const slot of ['nodes', 'changes', 'observations'] as const) test('canonical source check independently rejects an invented input quote in ' + slot, async () => {
  const d = JSON.parse(codecCheck(protocol()));d[slot][0].sources = [{root: 'input', pointer: '', quote: 'record B34'}];
  const intent = new Intent({schema: {type: 'object', properties: {recordId: {type: 'string'}}}, executor: {id: 'canonical-source-negative', async generate() {return {outcome: 'complete', text: JSON.stringify(d)};}}});
  try {await assert.rejects(intent.parse({input: 'Show records A12 and B34', fields: ['recordId']}), (e: unknown) => invalid('MODEL_OUTPUT_INVALID')(e) && (e as IntentError).details?.violations?.[0]?.rule === 'SOURCE_INVALID');}
  finally {await intent.dispose();}
});

test('canonical core independently rejects a phantom constraint change with a null target', async () => {
  const d = JSON.parse(codecCheck(protocol()));d.changes.push({...d.changes[0], targetKind: 'constraint', targetKey: null, description: 'None'});
  const intent = new Intent({schema: {type: 'object', properties: {recordId: {type: 'string'}}}, executor: {id: 'canonical-phantom-negative', async generate() {return {outcome: 'complete', text: JSON.stringify(d)};}}});
  try {await assert.rejects(intent.parse({input: 'Show record A12 without deleting it', fields: ['recordId']}), (e: unknown) => invalid('MODEL_OUTPUT_INVALID')(e) && (e as IntentError).details?.violations?.[0]?.path === '/changes/2/targetKey');}
  finally {await intent.dispose();}
});
