import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const outdir = path.resolve(process.env.INTENT_BUILD_DIR ?? 'dist');
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.build.json', '--emitDeclarationOnly', '--outDir', outdir], {stdio: 'inherit'});
await build({entryPoints: ['src/index.ts'], outdir, outbase: 'src', bundle: true, packages: 'external', platform: 'node', target: 'node20', format: 'esm', sourcemap: true});
await build({entryPoints: ['src/schema/worker.ts'], outfile: path.join(outdir, 'schema/worker.mjs'), bundle: true, packages: 'external', platform: 'node', target: 'node20', format: 'esm'});
