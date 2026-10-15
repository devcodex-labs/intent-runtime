import assert from 'node:assert/strict';
import {cp, mkdir, mkdtemp, readFile, readdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {checkResultLinks} from './documentation/result-check.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const [consumer, tarball] = process.argv.slice(2);
if (!consumer || !path.isAbsolute(consumer) || consumer.startsWith(repo)) throw new Error('Provide an external installed consumer directory.');
const work = await mkdtemp(path.join(consumer, 'documentation-'));
// Generated fixtures must still be reproducible through the installed core.
// A shape-only check cannot establish field ownership or withdrawal identity.
const generated = spawnSync(process.execPath, [path.join(repo, 'scripts/generate-doc-scenarios.mjs'), consumer], {encoding: 'utf8'});
if (generated.status !== 0) throw new Error(generated.stdout + generated.stderr);
const examples = path.join(work, 'examples');
await cp(path.join(repo, 'examples'), examples, {recursive: true});
function run(command, args, overrides = {}) {
  const result = spawnSync(command, args, {cwd: work, env: {...process.env, ...overrides}, encoding: 'utf8'});
  if (result.status !== 0) throw new Error('Example check failed: ' + args.join(' ') + '\n' + result.stderr);
  return result.stdout;
}
let syntaxFiles = 0;
async function syntax(dir) {for (const entry of await readdir(dir, {withFileTypes: true})) {const file = path.join(dir, entry.name); if (entry.isDirectory()) await syntax(file); else if (file.endsWith('.mjs')) {run(process.execPath, ['--check', file]); syntaxFiles++;}}}
await syntax(examples);
run(process.execPath, [path.join(consumer, 'node_modules/typescript/bin/tsc'), path.join(examples, 'custom-executor.ts'), '--outDir', path.join(work, 'compiled'), '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--strict', '--skipLibCheck']);

const {Client} = await import(pathToFileURL(path.join(consumer, 'node_modules/@modelcontextprotocol/client/dist/index.mjs')).href);
const {StdioClientTransport} = await import(pathToFileURL(path.join(consumer, 'node_modules/@modelcontextprotocol/client/dist/stdio.mjs')).href);
const {INTENT_RESULT_SCHEMA} = await import(pathToFileURL(path.join(consumer, 'node_modules/@devcodex/intent-runtime/dist/index.js')).href);
const {Validator} = await import(pathToFileURL(path.join(consumer, 'node_modules/schema-dsl/dist/pure.cjs')).href);
const validator = new Validator({logger: false, strict: false, useDefaults: false, coerceTypes: false, removeAdditional: false, allErrors: true});
let resultExamples = 0;
for (const stem of ['order', 'clarification']) {
  const input = JSON.parse(await readFile(path.join(repo, 'website/content/public/examples/' + stem + '-request.json'), 'utf8'));
  const result = JSON.parse(await readFile(path.join(repo, 'website/content/public/examples/' + stem + '-result.json'), 'utf8'));
  assert(validator.validate(INTENT_RESULT_SCHEMA, result, {smartCoerce: false, coerce: false, format: false}).valid);
  assert.equal(result.input, input.request.input);
  const names = Object.keys(input.config.instances);
  if (input.request.instance === undefined) assert.equal(names.length, 1);
  const instanceConfig = input.config.instances[input.request.instance ?? names[0]];
  assert(instanceConfig);
  const materials = {...instanceConfig, ...input.request};
  checkResultLinks(result, materials);
  resultExamples++;
}
validator.clearCache();

const protocolRecords = [];
// Reuse the language-only skeleton, including the interpretation required by
// this example's natural-language field description. The real core still
// validates the value and builds the Result; no complete Result is supplied.
const candidate = JSON.parse(await readFile(path.join(consumer, 'candidate.json'), 'utf8'));
candidate.normalizedInput = '查询订单000123';
Object.assign(candidate.nodes[0], {domain: '订单', action: '查询', target: '订单000123', goal: '查询订单000123'});
candidate.changes[0].description = '新增查询订单000123的请求';
candidate.observations[0].semantic = {status: 'valid', explanation: '输入明确给出订单编号000123，字符串保留前导零', sources: [{root: 'input', pointer: '', quote: '000123'}, {root: 'schema', pointer: '/properties/orderId/description'}], dependencies: []};
const candidateText = JSON.stringify(candidate);
for (const version of ['2025-06-18', '2025-11-25', '2026-07-28']) {
  const transport = new StdioClientTransport({command: process.execPath, args: [path.join(examples, 'mcp/server.mjs')], stderr: 'pipe'});
  let errors = ''; transport.stderr?.on('data', chunk => {errors += chunk;});
  const client = new Client({name: 'documentation-example-check', version: '1.0.0'}, {supportedProtocolVersions: [version], versionNegotiation: {mode: version === '2026-07-28' ? {pin: version} : 'legacy'}});
  try {
    await client.connect(transport);
    assert.equal(client.getNegotiatedProtocolVersion(), version);
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map(t => t.name), ['ping', 'ir_intent_prepare', 'ir_intent_accept', 'ir_intent_cancel']);
    assert.equal((await client.callTool({name: 'ping', arguments: {}})).structuredContent.message, 'pong');
    assert.equal((await client.listResources()).resources[0].uri, 'note://welcome');
    assert.equal((await client.readResource({uri: 'note://welcome'})).contents[0].text, 'Existing resource');
    assert.equal((await client.listPrompts()).prompts[0].name, 'welcome');
    assert.equal((await client.getPrompt({name: 'welcome'})).messages[0].content.text, 'Hello');
    const prepared = await client.callTool({name: 'ir_intent_prepare', arguments: {input: '查询订单000123', instance: 'orders', fields: ['orderId'], output: {diagnostics: true}}});
    assert.equal(prepared.isError, false);
    const accepted = await client.callTool({name: 'ir_intent_accept', arguments: {requestId: prepared.structuredContent.requestId, submissionToken: prepared.structuredContent.submissionToken, candidateText}});
    assert.equal(accepted.isError, false);
    assert.equal(accepted.structuredContent.effective.intents[0].inputs.orderId, '000123');
    assert.equal(accepted.structuredContent.diagnostics.modelCallCount, 0);
    assert.deepEqual(JSON.parse(accepted.content[0].text), accepted.structuredContent);
    const next = await client.callTool({name: 'ir_intent_prepare', arguments: {input: '停止这次识别', instance: 'orders'}});
    const cancelled = await client.callTool({name: 'ir_intent_cancel', arguments: {requestId: next.structuredContent.requestId}});
    assert.equal(cancelled.structuredContent.status, 'cancelled');
    protocolRecords.push({version, originalToolResourcePromptPreserved: true, prepareAcceptRealFieldValidation: true, prepareCancel: true});
    assert.equal(errors, '');
  } finally {await client.close();}
}

let globalMaintenance = 'not requested';
if (tarball) {
  const globalRoot = await mkdtemp(path.join(path.dirname(consumer), 'global-documentation-'));
  const prefix = path.join(globalRoot, 'prefix'), home = path.join(globalRoot, 'user'), config = path.join(home, 'intent.host.config.mjs');
  await mkdir(home);
  await cp(path.join(examples, 'codex/intent.host.config.mjs'), config);
  const npmExec = process.env.npm_execpath;
  const npmCommand = npmExec ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm';
  run(npmCommand, [...(npmExec ? [npmExec] : []), 'install', '--global', '--prefix', prefix, '--cache', path.join(globalRoot, 'npm-cache'), '--ignore-scripts', '--no-audit', '--no-fund', tarball]);
  const installed = path.join(prefix, ...(process.platform === 'win32' ? [] : ['lib']), 'node_modules/@devcodex/intent-runtime');
  const cli = path.join(installed, 'dist/cli/index.js');
  const env = {HOME: home, USERPROFILE: home, CODEX_HOME: path.join(home, '.codex'), INTENT_RUNTIME_HOME: path.join(home, '.intent-runtime')};
  const setup = ['setup', '--host', 'codex', '--config', config, '--json'];
  const first = JSON.parse(run(process.execPath, [cli, ...setup], env)); assert.equal(first.status, 'ok'); assert.equal(first.changed, true);
  assert.equal(JSON.parse(run(process.execPath, [cli, ...setup], env)).changed, false);
  assert.equal(JSON.parse(run(process.execPath, [cli, 'doctor', '--host', 'codex', '--json'], env)).status, 'ok');
  assert.equal(JSON.parse(run(process.execPath, [cli, 'clean', '--host', 'codex', '--json'], env)).status, 'ok');
  globalMaintenance = {isolatedPrefix: true, isolatedUserConfiguration: true, localConfigWithoutDependencies: true, setupRepeatDoctorClean: true};
}
// Execute the actual public examples. Only the provider's language reply is
// controlled; the API adapter, candidate checks, Worker, Validator and Result
// assembly remain real. This is not a provider or natural-language quality test.
const preload = path.join(work, 'controlled-provider.mjs');
await writeFile(preload, `import {readFileSync, writeFileSync} from 'node:fs';
import {Intent} from ${JSON.stringify(pathToFileURL(path.join(consumer, 'node_modules/@devcodex/intent-runtime/dist/index.js')).href)};
const seed=JSON.parse(readFileSync(${JSON.stringify(path.join(consumer, 'candidate.json'))},'utf8'));
const records=[]; const parse=Intent.prototype.parse;
Intent.prototype.parse=async function(request,options){const result=await parse.call(this,request,options);records.push({request,result});writeFileSync(process.env.INTENT_DOC_TRACE,JSON.stringify(records));return result;};
globalThis.fetch=async function(url,options){
 if(String(url)!=='https://api.openai.com/v1/responses')throw new Error('Unexpected provider URL');
 if(process.env.INTENT_DOC_FAILURE==='auth')return new Response('',{status:401});
 const body=JSON.parse(options.body), materials=JSON.parse(body.input[0].content[0].text), request=materials.request;
 const selected=request.fields==='all'?Object.keys(materials.schema.properties):request.fields;
 const c=structuredClone(seed), src={root:'input',pointer:''}; c.normalizedInput=request.input;
 Object.assign(c.nodes[0],{domain:'订单',action:'查询',target:'订单000123',goal:'查询订单000123'});
 c.observations=[];
 const observation=(field,value)=>({ownerKey:'order',container:'inputs',field,presence:'known',withdrawn:false,valueJson:JSON.stringify(value),rawText:null,sources:[src],semantic:null});
 if(/不(?:要)?取消订单/.test(request.input)){
  c.constraints=[{key:'no-cancel',priorRef:null,ownerKey:'order',scope:'intent',referenceKey:null,kind:'prohibition',text:'不取消订单',expressionJson:null,sources:[src]}];
  c.changes.push({operation:'add',effect:'applied',targetKind:'constraint',targetKey:'no-cancel',conditionKey:null,description:'保留禁止取消约束',sources:[src],deltaHints:[]});
 }
 if(selected.includes('orderId')){
  const o=observation('orderId','000123');
  if(materials.schema.properties.orderId.description)o.semantic={status:'valid',explanation:'用户明确提供字符串编号000123，保留前导零',sources:[src,{root:'schema',pointer:'/properties/orderId/description'}],dependencies:[]};
  c.observations.push(o);
 }
 if(selected.includes('isVip')||selected.includes('discount')){
  Object.assign(c.nodes[0],{action:'设置',goal:'设置订单000123的VIP状态和优惠'});
  if(request.baseline){c.kind='amendment';c.usedHistory=true;c.nodes[0].priorRef={root:'baseline',pointer:'/intents/0'};c.changes[0].operation='modify';}
  if(request.input.includes('VIP=true'))c.observations.push(observation('isVip',true),observation('discount',15));
  else if(request.input.includes('非VIP'))c.observations.push(observation('isVip',false));
  else c.observations.push(observation('discount',5));
 }
 return new Response(JSON.stringify({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(c)}]}]}),{status:200,headers:{'content-type':'application/json'}});
};
`);
const runnableExamples = [];
for (const name of ['basic', 'parse', 'multi-turn', 'native-response']) {
  const trace = path.join(work, name + '-results.json');
  const env = {INTENT_API_KEY: 'controlled-test-only', INTENT_MODEL: 'controlled-language-reply', INTENT_DOC_TRACE: trace, INTENT_DOC_FAILURE: ''};
  run(process.execPath, ['--import', pathToFileURL(preload).href, path.join(examples, 'api', name + '.mjs')], env);
  const results = JSON.parse(await readFile(trace, 'utf8')).map(record => record.result);
  if (name === 'basic') {assert.equal(results.length, 1); assert.equal(results[0].fieldResults.length, 0); assert.equal(results[0].effective.intents[0].constraints[0].kind, 'prohibition');}
  if (name === 'parse' || name === 'native-response') assert.equal(results[0].effective.intents[0].inputs.orderId, '000123');
  if (name === 'multi-turn') {
    assert.equal(results.length, 3);
    const [first, second, third] = results;
    assert.deepEqual(first.effective.intents[0].inputs, {orderId: '000123', isVip: true, discount: 15});
    assert.equal(second.effective.intents[0].id, first.effective.intents[0].id);
    assert.deepEqual(second.effective.intents[0].inputs, {orderId: '000123', isVip: false});
    assert(second.fieldResults.some(f => f.field === 'discount' && f.status === 'invalidated'));
    assert(second.issues.some(i => i.code === 'FIELD_INVALIDATED'));
    assert.deepEqual(third.effective.intents[0].inputs, {orderId: '000123', isVip: false, discount: 5});
    assert(!third.issues.some(i => i.field === 'discount'));
  }
  const failed = spawnSync(process.execPath, ['--import', pathToFileURL(preload).href, path.join(examples, 'api', name + '.mjs')], {cwd: work, env: {...process.env, ...env, INTENT_DOC_FAILURE: 'auth'}, encoding: 'utf8'});
  assert.equal(failed.status, 1); assert.equal(JSON.parse(failed.stderr.trim()).code, 'MODEL_AUTH_FAILED');
  runnableExamples.push({name, actualCoreResults: results.length, authenticationFailureHandled: true});
}
await writeFile(path.join(work, 'verification.json'), JSON.stringify({node: process.version, syntaxFiles, customExecutorStrictTypes: true, resultExamples, protocolRecords, globalMaintenance, runnableExamples, realProviderCalls: 0, scope: 'User documentation installation/configuration/SDK examples and static result fixtures; not model semantic acceptance.'}, null, 2) + '\n');
console.log('User examples verified: ' + syntaxFiles + ' ESM files, strict custom executor, ' + resultExamples + ' full responses, 3 actual SDK protocols, 4 runnable API examples and auth failure branches, ' + (tarball ? 'isolated global setup/doctor/clean' : 'no new global install') + '.');
