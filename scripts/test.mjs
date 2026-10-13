import { build } from 'esbuild';
import { mkdir, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const root = path.resolve(process.env.INTENT_TEST_DIR ?? '../intent-runtime.codex-temp/v2-development-20261013/builds/tests');
await mkdir(root, {recursive: true});
const tests = (await readdir('tests')).filter(f => f.endsWith('.test.ts'));
if (!tests.length) throw new Error('No tests');
// Bundling source resolves the repository's real dependencies, never a fake validator.
// Absolute package URLs let external test outputs resolve the same installed package.
const plugins = [{name: 'dependencies', setup(b) {b.onResolve({filter: /^(schema-dsl|bcp-47)(\/.*)?$/}, args => ({path: import.meta.resolve(args.path), external: true}));}}];
await build({entryPoints: tests.map(f => 'tests/' + f), outdir: root, outbase: 'tests', bundle: true, platform: 'node', target: 'node20', format: 'esm', outExtension: {'.js': '.mjs'}, plugins});
await build({entryPoints: ['src/schema/worker.ts'], outfile: path.join(root, 'schema/worker.mjs'), bundle: true, platform: 'node', target: 'node20', format: 'esm', plugins});
const result = spawnSync(process.env.INTENT_TEST_NODE ?? process.execPath, ['--test', ...tests.map(f => path.join(root, f.replace(/\.ts$/, '.mjs')))], {stdio: 'inherit'});
process.exitCode = result.status ?? 1;
