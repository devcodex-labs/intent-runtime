import { build } from 'esbuild';
import { mkdir, readdir, copyFile, symlink, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root = path.resolve(process.env.INTENT_TEST_DIR ?? '../intent-runtime.codex-temp/v2-development-20261013/builds/tests');
await mkdir(root, {recursive: true});
const tests = (await readdir('tests')).filter(f => f.endsWith('.test.ts'));
if (!tests.length) throw new Error('No tests');
// Bundling source resolves the repository's real dependencies, never a fake validator.
// Absolute package URLs let external test outputs resolve the same installed package.
const plugins = [{name: 'dependencies', setup(b) {b.onResolve({filter: /^(schema-dsl|bcp-47|toml-eslint-parser|@modelcontextprotocol\/(?:server|client))(\/.*)?$/}, async args => {
  if (args.pluginData?.resolvedDependency) return;
  const resolved = await b.resolve(args.path, {resolveDir: process.cwd(), kind: 'import-statement', pluginData: {resolvedDependency: true}});
  if (resolved.errors.length) throw new Error('Cannot resolve actual dependency: ' + args.path);
  return {path: pathToFileURL(resolved.path).href, external: true};
});}}];
await build({entryPoints: tests.map(f => 'tests/' + f), outdir: root, outbase: 'tests', bundle: true, platform: 'node', target: 'node20', format: 'esm', outExtension: {'.js': '.mjs'}, plugins, define: {INTENT_RUNTIME_PACKAGE_VERSION: JSON.stringify(JSON.parse(await readFile('package.json', 'utf8')).version)}});
await build({entryPoints: ['src/schema/worker.ts'], outfile: path.join(root, 'schema/worker.mjs'), bundle: true, platform: 'node', target: 'node20', format: 'esm', plugins});
const packageRoot = path.join(root, 'package'), outdir = path.join(packageRoot, 'dist');
const built = spawnSync(process.execPath, ['scripts/build.mjs'], {stdio: 'inherit', env: {...process.env, INTENT_BUILD_DIR: outdir}});
if (built.status !== 0) process.exit(built.status ?? 1);
await mkdir(path.join(packageRoot, 'integrations/codex'), {recursive: true});
await copyFile('package.json', path.join(packageRoot, 'package.json'));
await copyFile('integrations/codex/SKILL.md', path.join(packageRoot, 'integrations/codex/SKILL.md'));
// External production-build tests read the real installed dependencies. This
// link is not an output destination and no test writes into node_modules.
try {await symlink(path.resolve('node_modules'), path.join(packageRoot, 'node_modules'), 'junction');} catch (error) {if (error.code !== 'EEXIST') throw error;}
const result = spawnSync(process.env.INTENT_TEST_NODE ?? process.execPath, ['--test', ...tests.map(f => path.join(root, f.replace(/\.ts$/, '.mjs')))], {stdio: 'inherit', env: {...process.env, INTENT_TEST_DIR: root, INTENT_PACKAGE_TEST_ROOT: packageRoot}});
process.exitCode = result.status ?? 1;
