import {readFile, writeFile, appendFile, mkdir, mkdtemp, access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repo = fileURLToPath(new URL('../', import.meta.url));
const registry = 'https://registry.npmjs.org/';

/** Skip an existing identical artifact; a version is never overwritten. */
export function publicationAction(published, expected) {
  if (published === undefined) return 'publish';
  if (published.name !== expected.name || published.version !== expected.version || !published.dist?.integrity?.split(/\s+/).includes(expected.integrity)) throw new Error('Existing registry version differs from the verified artifact; do not republish or move its tag.');
  return 'skip';
}

/** Registry errors fail closed; only an actual 404 means a missing version. */
export async function registryVersion(name, version, fetcher = fetch) {
  const response = await fetcher(registry + encodeURIComponent(name) + '/' + encodeURIComponent(version), {signal:AbortSignal.timeout(15000)});
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error('Registry lookup failed: HTTP ' + response.status);
  return response.json();
}

/** Allow bounded registry propagation without hiding lookup or integrity errors. */
export async function waitForRegistry(expected, {lookup = registryVersion, wait = () => new Promise(resolve => setTimeout(resolve,5000))} = {}) {
  for (let attempt = 0; attempt < 61; attempt++) {
    const published = await lookup(expected.name,expected.version);
    if (published !== undefined) {
      publicationAction(published,expected);
      const latest = await lookup(expected.name,'latest');
      if (latest?.version === expected.version) {publicationAction(latest,expected); return {published,latest};}
    }
    if (attempt < 60) await wait();
  }
  throw new Error('Published version and matching default npm install did not become visible in the registry.');
}

/** Exercise the same installed entries before publication and from the registry. */
export async function verifyInstalledEntries(consumer, version) {
  const installed = path.join(consumer,'node_modules','@devcodex','intent-runtime');
  await access(path.join(installed,'dist/schema/worker.mjs'));
  const run = args => {
    const result = spawnSync(process.execPath,args,{cwd:consumer,encoding:'utf8',timeout:30000});
    if (result.status !== 0) throw new Error('Installed entry verification failed: ' + (result.error?.message ?? result.stderr));
    return result.stdout.trim();
  };
  run(['--input-type=module','-e',"import {Intent} from '@devcodex/intent-runtime'; import {createApiExecutor} from '@devcodex/intent-runtime/adapters/api'; import {createIntentMcpAdapter} from '@devcodex/intent-runtime/mcp'; if (typeof createApiExecutor !== 'function' || typeof createIntentMcpAdapter !== 'function') throw new Error('Missing entry'); const intent = new Intent({}); await intent.dispose();"]);
  for (const cli of ['index.js','mcp.js']) if (run([path.join(installed,'dist/cli',cli),'--version']) !== version) throw new Error('Installed CLI version differs.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, archive] = process.argv.slice(2);
  if (!['plan','verify'].includes(mode) || !archive) throw new Error('Usage: npm run release:registry -- plan|verify <verified-tarball>');
  const metadata = JSON.parse(await readFile(path.join(repo,'package.json'),'utf8'));
  const expected = {name:metadata.name,version:metadata.version,integrity:'sha512-' + createHash('sha512').update(await readFile(archive)).digest('base64')};
  if (mode === 'plan') {
    const action = publicationAction(await registryVersion(expected.name,expected.version),expected);
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT,'publish=' + (action === 'publish') + '\n');
    console.log('Registry action: ' + action);
  } else {
    const {latest} = await waitForRegistry(expected);
    const base = path.resolve(process.env.INTENT_RELEASE_VERIFY_DIR ?? path.join(repo,'../intent-runtime.codex-temp/release-registry'));
    if (base === path.resolve(repo) || base.startsWith(path.resolve(repo) + path.sep)) throw new Error('Registry verification output must be outside the checkout.');
    await mkdir(base,{recursive:true});
    if (!process.env.npm_execpath) throw new Error('Invoke this verifier through npm run release:registry.');
    const consumers = [];
    for (const specifier of [expected.name + '@' + expected.version, expected.name]) {
      const consumer = await mkdtemp(path.join(base,'consumer-'));
      await writeFile(path.join(consumer,'package.json'),'{"private":true,"type":"module"}\n');
      const run = args => {const r = spawnSync(process.execPath,args,{cwd:consumer,encoding:'utf8',timeout:180000,env:{...process.env,npm_config_cache:path.join(consumer,'cache')}}); if (r.status !== 0) throw new Error('Registry consumer verification failed: ' + (r.error?.message ?? r.stderr)); return r.stdout.trim();};
      run([process.env.npm_execpath,'install',specifier,'--registry',registry,'--ignore-scripts','--no-audit','--no-fund']);
      const lock = JSON.parse(await readFile(path.join(consumer,'package-lock.json'),'utf8'));
      const entry = lock.packages['node_modules/' + expected.name];
      if (entry?.integrity !== expected.integrity || entry.version !== expected.version) throw new Error('Installed registry version or integrity differs.');
      await verifyInstalledEntries(consumer,expected.version);
      consumers.push({specifier,consumer});
    }
    await writeFile(path.join(base,'registry-verification.json'),JSON.stringify({...expected,consumers,latest:latest.version,entries:true,cliVersions:true,worker:true},null,2)+'\n');
    console.log('Registry installation and default version verified: ' + expected.name + '@' + expected.version);
  }
}
