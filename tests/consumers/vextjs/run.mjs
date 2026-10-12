import { execFileSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifySource } from "./source-identity.mjs";

const source = process.env.VEXTJS_SOURCE_ROOT;
if (!source) { console.error("NOT RUN: set VEXTJS_SOURCE_ROOT to the fixed source checkout documented in this fixture."); process.exit(2); }
await verifySource(resolve(source));
if (!process.env.npm_execpath) throw new Error("Run through npm run test:consumer.");
const project = fileURLToPath(new URL("../../../", import.meta.url));
const fixture = fileURLToPath(new URL("./", import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), "intent-vext-consumer-"));
const env = { ...process.env, npm_config_cache: process.env.npm_config_cache ?? join(temporary, "cache") };
const npm = (args, cwd = temporary) => execFileSync(process.execPath, [process.env.npm_execpath, ...args], { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 180000 });
let passed = false;
try {
  await copyFile(join(fixture, "package.json"), join(temporary, "package.json"));
  await copyFile(join(fixture, "package-lock.json"), join(temporary, "package-lock.json"));
  npm(["ci", "--ignore-scripts", "--no-audit", "--no-fund"]);
  const packed = JSON.parse(npm(["pack", "--ignore-scripts", "--json", "--pack-destination", temporary], project));
  npm(["install", "--ignore-scripts", "--no-audit", "--no-fund", "--no-save", "--package-lock=false", join(temporary, packed[0].filename)]);
  for (const file of ["verify.mjs", "source-identity.mjs"]) await copyFile(join(fixture, file), join(temporary, file));
  await mkdir(join(temporary, "shared"));
  for (const file of ["instances.mjs", "candidate-driver.mjs"]) await copyFile(join(project, "examples/shared", file), join(temporary, "shared", file));
  await copyFile(join(project, "examples/mcp/sdk-v2/registration.mjs"), join(temporary, "registration.mjs"));
  await writeFile(join(temporary, "build-fixture.mjs"), `import {build} from 'esbuild';await build({entryPoints:[${JSON.stringify(join(resolve(source), "src/mcp/server.ts"))}],absWorkingDir:${JSON.stringify(resolve(source))},outfile:${JSON.stringify(join(temporary, "vext-mcp-factory.mjs"))},bundle:true,platform:'node',format:'esm',packages:'external'});`);
  execFileSync(process.execPath, ["build-fixture.mjs"], { cwd: temporary, env, stdio: "pipe", timeout: 30000 });
  const output = execFileSync(process.execPath, ["verify.mjs"], { cwd: temporary, env: { ...env, VEXTJS_SOURCE_ROOT: resolve(source), VEXTJS_FACTORY_MODULE: join(temporary, "vext-mcp-factory.mjs") }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60000 });
  process.stdout.write(output);
  await verifySource(resolve(source));
  passed = true;
} finally {
  if (passed) await rm(temporary, { recursive: true, force: true });
  else console.error("Consumer fixture retained for diagnosis: " + temporary);
}
