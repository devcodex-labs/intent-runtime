import assert from 'node:assert/strict';
import {cp, mkdir, mkdtemp, readFile, readdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';

const repo = fileURLToPath(new URL('../', import.meta.url));
const [consumer, tarball] = process.argv.slice(2);
if (!consumer || !path.isAbsolute(consumer) || consumer.startsWith(repo)) throw new Error('Provide an external installed consumer directory.');
const work = await mkdtemp(path.join(consumer, 'documentation-'));
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
function pointer(root, text) {
  assert(text === '' || text.startsWith('/'));
  assert(!/~(?![01])/u.test(text));
  return text === '' ? root : text.slice(1).split('/').map(s => s.replace(/~1/g, '/').replace(/~0/g, '~')).reduce((value, key) => {assert(value !== null && typeof value === 'object' && Object.hasOwn(value, key), text); return value[key];}, root);
}
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
  function sources(value) {
    if (!value || typeof value !== 'object') return;
    if ('root' in value && 'pointer' in value) {
      assert(Object.hasOwn(materials, value.root));
      const source = pointer(materials[value.root], value.pointer);
      if (value.quote !== undefined) assert((typeof source === 'string' ? source : JSON.stringify(source)).includes(value.quote));
    }
    for (const child of Object.values(value)) sources(child);
  }
  sources(result);
  const ids = new Set();
  function add(value) {assert(!ids.has(value.id)); ids.add(value.id);}
  function intents(nodes) {for (const node of nodes) {add(node); node.constraints.forEach(add); const local = new Set(); for (const ref of node.references) {assert(!local.has(ref.id)); local.add(ref.id);} intents(node.children);}}
  intents(result.effective.intents);
  result.effective.constraints.forEach(add); result.effective.relations.forEach(add); result.issues.forEach(add);
  for (const change of result.turn.changes) {if (change.target.kind !== 'unresolved') assert(ids.has(change.target.id)); if (change.conditionId) assert(ids.has(change.conditionId));}
  for (const id of result.turn.intentIds) assert(ids.has(id));
  for (const entry of result.evidence ?? []) pointer(result, entry.target);
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
await writeFile(path.join(work, 'verification.json'), JSON.stringify({node: process.version, syntaxFiles, customExecutorStrictTypes: true, resultExamples, protocolRecords, globalMaintenance, modelCalls: 0, scope: 'User documentation installation/configuration/SDK examples and static result fixtures; not model semantic acceptance.'}, null, 2) + '\n');
console.log('User examples verified: ' + syntaxFiles + ' ESM files, strict custom executor, ' + resultExamples + ' full responses, 3 actual SDK protocols, ' + (tarball ? 'isolated global setup/doctor/clean' : 'no new global install') + '.');
