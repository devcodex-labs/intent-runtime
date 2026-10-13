import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import {mkdir, mkdtemp, lstat, rename} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
const outdir = path.resolve(process.env.INTENT_BUILD_DIR ?? 'dist');
const repo = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
if (outdir === repo || outdir.startsWith(repo + path.sep) && outdir !== path.join(repo, 'dist')) throw new Error('Use dist or an output directory outside the source checkout.');
const stagingBase = path.join(repo, '../intent-runtime.codex-temp/package-build/builds');
await mkdir(stagingBase, {recursive: true});
const task = await mkdtemp(path.join(stagingBase, 'build-')), next = path.join(task, 'next');
const define = {INTENT_RUNTIME_PACKAGE_VERSION: JSON.stringify(JSON.parse(readFileSync('package.json', 'utf8')).version)};
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.build.json', '--emitDeclarationOnly', '--outDir', next], {stdio: 'inherit'});
await build({entryPoints: ['src/index.ts', 'src/adapters/api.ts', 'src/mcp/index.ts', 'src/cli/mcp.ts', 'src/cli/index.ts'], outdir: next, outbase: 'src', bundle: true, splitting: true, chunkNames: 'shared-[hash]', packages: 'external', platform: 'node', target: 'node20', format: 'esm', sourcemap: true, define});
await build({entryPoints: ['src/schema/worker.ts'], outfile: path.join(next, 'schema/worker.mjs'), bundle: true, packages: 'external', platform: 'node', target: 'node20', format: 'esm'});
await mkdir(path.dirname(outdir), {recursive: true});
let prior = false;
try {const stat = await lstat(outdir); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe output destination.'); prior = true;} catch (error) {if (error.code !== 'ENOENT') throw error;}
// A complete fresh build replaces old output. Preserve pre-existing output
// outside the checkout rather than including obsolete modules in the tarball.
if (prior) await rename(outdir, path.join(task, 'previous'));
try {await rename(next, outdir);} catch (error) {if (prior) await rename(path.join(task, 'previous'), outdir); throw error;}
