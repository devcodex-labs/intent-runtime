import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {buildScenarios, simpleCandidate} from './documentation/scenarios.mjs';
import {english} from './documentation/english.mjs';
import {checkResultLinks, readableIds} from './documentation/result-check.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const [consumer, mode] = process.argv.slice(2);
if (!consumer || !path.isAbsolute(consumer) || ![undefined, '--write'].includes(mode)) throw new Error('Usage: node scripts/generate-doc-scenarios.mjs <external-installed-consumer> [--write]');
const runtime = await import(pathToFileURL(path.join(consumer, 'node_modules/@devcodex/intent-runtime/dist/index.js')).href);
const {Validator} = await import(pathToFileURL(path.join(consumer, 'node_modules/schema-dsl/dist/pure.cjs')).href);
const validator = new Validator({logger: false, strict: false, useDefaults: false, coerceTypes: false, removeAdditional: false, allErrors: true});
for (const locale of ['zh', 'en']) {
const cases = await buildScenarios(runtime, locale);
let calls = 0;
const optionsIntent = new runtime.Intent({defaultOutput: {evidence: true, suggestions: true, diagnostics: true}, executor: {id: 'documentation-options', async generate() {calls++; return {outcome: 'complete', text: JSON.stringify(simpleCandidate())};}}});
try {
  await assert.rejects(optionsIntent.parse({input: '查询订单000123', fields: ['orderId']}), {code: 'SCHEMA_NOT_CONFIGURED'});
  assert.equal(calls, 0, 'Invalid configuration must fail before model generation');
  const correctedCandidate = simpleCandidate();
  correctedCandidate.observations = [{ownerKey: 'order', container: 'inputs', field: 'orderId', presence: 'known', withdrawn: false, valueJson: '"000123"', rawText: null, sources: [{root: 'input', pointer: ''}], semantic: null}];
  const corrected = new runtime.Intent({schema: {type: 'object', properties: {orderId: {type: 'string'}}}, executor: {id: 'documentation-schema-recovery', async generate() {return {outcome: 'complete', text: JSON.stringify(correctedCandidate)};}}});
  try {assert.equal((await corrected.parse({input: '查询订单000123', fields: ['orderId']})).effective.intents[0].inputs.orderId, '000123');}
  finally {await corrected.dispose();}
  const enabled = await optionsIntent.parse({input: '查询订单000123', output: {}});
  assert(Array.isArray(enabled.evidence) && Array.isArray(enabled.suggestions));
  assert.equal(enabled.diagnostics.modelCallCount, 1);
  const disabled = await optionsIntent.parse({input: '查询订单000123', output: {evidence: false, suggestions: false, diagnostics: false}});
  for (const name of ['evidence', 'suggestions', 'diagnostics']) assert(!Object.hasOwn(disabled, name));
} finally {await optionsIntent.dispose();}
try {
  for (const example of cases) {
    assert(validator.validate(runtime.INTENT_RESULT_SCHEMA, example.result, {smartCoerce: false, coerce: false, format: false}).valid, example.slug);
    checkResultLinks(example.result, {...example.config, ...example.request});
  }
} finally {validator.clearCache();}
const outputs = new Map([['scenarios.json', {method: 'Fixed language candidates processed by the installed core; real schema-dsl business validation where configured. Opaque IDs renamed consistently. Not a real-model accuracy benchmark.', cases}]]);
const {createIntentMcpAdapter} = await import(pathToFileURL(path.join(consumer, 'node_modules/@devcodex/intent-runtime/dist/mcp/index.js')).href);
const instance = new runtime.Intent({language: locale === 'en' ? 'en' : 'zh-CN', executor: {id: 'documentation-mcp-language', async generate() {return {outcome: 'complete', text: JSON.stringify(locale === 'en' ? english(simpleCandidate(true)) : simpleCandidate(true))};}}});
const adapter = createIntentMcpAdapter({mode: 'executor', instances: {main: instance}});
try {
  const session = adapter.connect({protocolVersion: '2025-06-18'});
  const params = {name: 'intent_parse', arguments: {input: locale === 'en' ? english('查询订单000123，不要取消订单') : '查询订单000123，不要取消订单'}};
  const reply = await session.callTool(params.name, params.arguments);
  assert.equal(reply.isError, false);
  assert.deepEqual(JSON.parse(reply.content[0].text), reply.structuredContent);
  const example = readableIds(reply);
  example.content[0].text = JSON.stringify(example.structuredContent);
  outputs.set('executor-request.json', {jsonrpc: '2.0', id: 1, method: 'tools/call', params});
  outputs.set('executor-result.json', example);
} finally {await adapter.close(); await instance.dispose();}
for (const example of cases) outputs.set(example.slug + '-example.json', example);
const native = cases.find(c => c.slug === 'native');
outputs.set('native-request.json', {config: native.config, request: native.request});
outputs.set('native-result.json', native.result);
if (locale === 'en') {
  const clarification = cases.find(c => c.slug === 'ambiguity');
  for (const [stem, example] of [['order', native], ['clarification', clarification]]) {
    outputs.set(stem + '-request.json', {config: {mode: 'host', instances: {main: example.config}}, request: example.request});
    outputs.set(stem + '-result.json', example.result);
  }
}
const outputDirectory = path.join(repo, 'website/content/public/examples', locale === 'en' ? 'en' : '');
if (mode === '--write') await mkdir(outputDirectory, {recursive: true});
for (const [name, value] of outputs) {
  const file = path.join(outputDirectory, name);
  if (mode === '--write') await writeFile(file, JSON.stringify(value, null, 2) + '\n');
  else assert(isDeepStrictEqual(JSON.parse(await readFile(file, 'utf8')), value), 'Stale documentation fixture: ' + name);
}
console.log(`Documentation scenarios ${locale} ${mode ? 'generated' : 'verified'}: ${cases.length}; actual core and configured business validation, real model calls: 0.`);
}
