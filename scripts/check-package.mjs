import {mkdtemp, mkdir, readFile, writeFile, cp, readdir} from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {verifyInstalledEntries} from './release-registry.mjs';

const repo = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const base = path.resolve(process.env.INTENT_PACKAGE_CHECK_DIR ?? path.join(repo, '../intent-runtime.codex-temp/package-check'));
if (base === repo || base.startsWith(repo + path.sep)) throw new Error('Package check output must be outside the repository.');
await mkdir(base, {recursive: true});
const work = await mkdtemp(path.join(base, 'run-')), stage = path.join(work, 'stage'), archives = path.join(base, 'archives');
await mkdir(stage); await mkdir(archives, {recursive: true});
function run(command, args, cwd, overrides = {}) {const r = spawnSync(command, args, {cwd, encoding: 'utf8', env: {...process.env, ...overrides}}); if (r.status !== 0) {process.stderr.write(r.stderr ?? ''); throw new Error('Package check failed: ' + path.basename(command));} return r.stdout;}
run(process.execPath, ['scripts/build.mjs'], repo, {INTENT_BUILD_DIR: path.join(stage, 'dist')});
for (const name of ['package.json','README.md','CHANGELOG.md','LICENSE','integrations']) await cp(path.join(repo, name), path.join(stage, name), {recursive: true});
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
// Keep the include/omit experiment independent of the caller's npm settings.
// Both spellings matter on POSIX; Windows resolves environment names without case.
const npmEnv = {npm_config_cache:path.join(base,'cache'), npm_config_include:'', NPM_CONFIG_INCLUDE:'', npm_config_omit:'', NPM_CONFIG_OMIT:''};
const npm = (args,cwd) => process.env.npm_execpath ? run(process.execPath, [process.env.npm_execpath, ...args], cwd, npmEnv) : run(npmBin,args,cwd,npmEnv);
const [{filename}] = JSON.parse(npm(['pack','--ignore-scripts','--pack-destination',archives,'--json'], stage));
const tarball = path.join(archives, filename), packed = await readFile(tarball), hash = createHash('sha256').update(packed).digest('hex');
await writeFile(path.join(archives, 'SHA256SUMS'), hash + '  ' + filename + '\n');
const metadata = JSON.parse(await readFile(path.join(repo, 'package.json'), 'utf8'));
const candidate = {version: 'candidate-2', kind: 'request', normalizedInput: 'Query supplied order', relatedKeys: ['order'], historyCoverage: 'complete', usedHistory: false,
  messages: Object.fromEntries(['changed','notApplicable','noValue','noDeclaration','explicitNull','invalid','open','mixed','semanticUnknown','unresolved','relationConflict'].map(k => [k, 'Supplied material explanation: ' + k])),
  nodes: [{key:'order', parentKey:null, priorRef:null, domain:'order', action:'query', target:'000123', goal:'Query order 000123', understanding:'clear', optional:null, expectedOutput:[], sources:[{root:'input', pointer:''}]}],
  constraints:[], references:[], relations:[], priorTargets:[], changes:[{operation:'add', effect:'applied', targetKind:'intent', targetKey:'order', conditionKey:null, description:'Current query', sources:[{root:'input',pointer:''}], deltaHints:[]}],
  observations:[{ownerKey:'order', container:'inputs', field:'orderId', presence:'known', withdrawn:false, valueJson:'"000123"', rawText:null, sources:[{root:'input',pointer:''}], semantic:null}], issues:[], inferences:[], evidence:[], suggestions:[]};
for (const omit of [false, true]) {
  const consumer = path.join(work, omit ? 'without-optional' : 'consumer'); await mkdir(consumer);
  await writeFile(path.join(consumer, 'package.json'), '{"private":true,"type":"module"}\n');
  npm(['install','--ignore-scripts','--no-audit','--no-fund', ...(omit ? ['--omit=optional'] : []), tarball, 'typescript@5.9.3', '@types/node@20.19.0'], consumer);
  await writeFile(path.join(consumer, 'candidate.json'), JSON.stringify(candidate));
  await writeFile(path.join(consumer, 'verify.mjs'), `import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Intent, IntentError} from '@devcodex/intent-runtime';
import {createApiExecutor} from '@devcodex/intent-runtime/adapters/api';
import {createIntentMcpAdapter} from '@devcodex/intent-runtime/mcp';
import {s} from 'schema-dsl/pure';
const candidate=await readFile(new URL('./candidate.json',import.meta.url),'utf8');
const intent=new Intent({schema:s({orderId:'string!'}),executor:{id:'package-controlled-language',async generate(){return {outcome:'complete',text:candidate};}}});
const adapter=createIntentMcpAdapter({mode:'host',instances:{orders:intent}});
try {
 const first=await intent.parse({input:'query order 000123',fields:['orderId']}); assert.equal(first.effective.intents[0].inputs.orderId,'000123');
 const session=adapter.connect({protocolVersion:'2026-07-28'});
 const p=await session.callTool('intent_runtime_prepare',{input:'query order 000123',fields:['orderId']});assert.equal(p.isError,false);
 const t=p.structuredContent;
 const done=await session.callTool('intent_runtime_accept',{requestId:t.requestId,submissionToken:t.submissionToken,candidateText:candidate});assert.equal(done.structuredContent.effective.intents[0].inputs.orderId,'000123');assert.equal(done.resultType,'complete');
 assert.throws(()=>createApiExecutor({provider:'unknown',model:'x',apiKey:'x'}),e=>e instanceof IntentError&&e.code==='CONFIG_INVALID');
} finally {await adapter.close();await intent.dispose();}
console.log('Installed Native/worker/API/MCP entries verified.');
`);
  run(process.execPath, ['verify.mjs'], consumer);
  await writeFile(path.join(consumer, 'consumer.ts'), `import {Intent,type ModelExecutor} from '@devcodex/intent-runtime';
import {createApiExecutor,type ApiExecutorConfig} from '@devcodex/intent-runtime/adapters/api';
import {createIntentMcpAdapter,type IntentMcpServerConfig} from '@devcodex/intent-runtime/mcp';
interface AgentState { arbitrary: { count: number } }
declare const state: AgentState; declare const executor:ModelExecutor;
const i=new Intent({executor});void i.parse({input:'query',context:state});
const api:ApiExecutorConfig={provider:'openai',model:'configured',apiKey:'configured'};createApiExecutor(api);
const config:IntentMcpServerConfig={mode:'host',instances:{main:{}}};void config;
createIntentMcpAdapter({mode:'host',instances:{main:i}});
`);
  run(process.execPath, ['node_modules/typescript/bin/tsc','--noEmit','--strict','--module','NodeNext','--moduleResolution','NodeNext','--target','ES2022','--skipLibCheck','consumer.ts'], consumer);
  const installed = path.join(consumer, 'node_modules', ...metadata.name.split('/'));
  await verifyInstalledEntries(consumer,metadata.version);
  for (const entry of ['dist/index.js','dist/schema/worker.mjs','integrations/codex/SKILL.md']) assertSame(await readFile(path.join(stage, entry)), await readFile(path.join(installed, entry)));
  for (const cli of ['index.js','mcp.js']) run(process.execPath, [path.join(installed, 'dist/cli', cli), '--help'], consumer);
  if (!omit) run(process.execPath, [path.join(repo, 'scripts/check-doc-examples.mjs'), consumer, tarball], consumer);
  if (omit) for (const packageName of ['@modelcontextprotocol/server','@modelcontextprotocol/client']) if ((await readdir(path.join(consumer, 'node_modules/@modelcontextprotocol')).catch(() => [])).includes(packageName.split('/')[1])) throw new Error('Optional dependency isolation was not tested.');
}
function assertSame(a,b) {if (!a.equals(b)) throw new Error('Installed artifact differs from the built package.');}
await writeFile(path.join(work, 'verification.json'), JSON.stringify({node:process.version, packageVersion:metadata.version, contractVersion:'2.0-draft.6', tarball, sha256:hash, cases:['native-worker','api-entry-error-identity','mcp-shared-core','consumer-types','cli-help','without-optional-sdk','installed-byte-identity']},null,2)+'\n');
console.log('Empty-directory tarball verified on ' + process.version + '. SHA-256 ' + hash);
