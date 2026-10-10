import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const root = process.cwd();
const temp = mkdtempSync(path.join(tmpdir(), "intent-global-中文 "));
const checks = [];
let passed = false;
function run(args, env, cwd = temp, expected = 0, timeoutMs = 30000) {
  try {
    const output = execFileSync(process.execPath, args, { cwd, env: { ...process.env, ...env }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: timeoutMs });
    assert.equal(expected, 0, "Expected command failure");
    return output;
  } catch (error) {
    if (error.status !== expected) throw new Error("Command failed: " + args.join(" ") + "\n" + error.stdout + "\n" + error.stderr, { cause: error });
    return String(error.stdout);
  }
}
function npm(args, env, cwd, expected) {
  assert.ok(process.env.npm_execpath, "Run through npm run smoke:installation");
  // Cold dependency extraction on Windows can exceed a minute. This budget
  // applies to npm only; actual MCP probes retain their bounded timeout.
  return run([process.env.npm_execpath, ...args], env, cwd, expected, 180000);
}
function sandbox(name) {
  const home = path.join(temp, name, "user 中文 space");
  const prefix = path.join(temp, name, "prefix");
  const codex = path.join(home, ".codex");
  mkdirSync(codex, { recursive: true });
  const env = { INTENT_RUNTIME_USER_HOME: home, CODEX_HOME: codex, INTENT_RUNTIME_SKIP_AUTO_CONFIG: "0", npm_config_ignore_scripts: "false", npm_config_cache: process.env.npm_config_cache ?? path.join(temp, "cache") };
  return { home, prefix, codex, env };
}
function installed(prefix) {
  return path.join(prefix, ...(process.platform === "win32" ? [] : ["lib"]), "node_modules", "@devcodex", "intent-runtime");
}
function metadata(home) { return JSON.parse(readFileSync(path.join(home, ".intent-runtime", "state.json"), "utf8")); }
function doctor(prefix, env, expected = 0, repair = false) {
  return JSON.parse(run([path.join(installed(prefix), "dist", "installation", "cli.js"), "doctor", "--json", ...(repair ? ["--repair"] : [])], env, temp, expected));
}
try {
  const buildEnv = { npm_config_cache: process.env.npm_config_cache ?? path.join(temp, "cache") };
  const packed = JSON.parse(npm(["pack", "--json", "--pack-destination", temp], buildEnv, root));
  const tar = path.join(temp, packed[0].filename);
  assert.ok(packed[0].files.some(f => f.path === "scripts/postinstall.mjs"));
  assert.ok(packed[0].files.some(f => f.path === "dist/installation/cli.js"));
  const standard = sandbox("standard");
  writeFileSync(path.join(standard.codex, "config.toml"), '# keep comment\nmodel="existing"\n[mcp_servers.other]\ncommand="foreign"\nargs=[]\n');
  npm(["install", "-g", "--prefix", standard.prefix, "--engine-strict", "--no-audit", "--no-fund", tar], standard.env);
  let current = metadata(standard.home);
  assert.equal(current.status, "configured");
  assert.deepEqual(current.instances, ["default"]);
  assert.equal(current.registrations[0].entry.command, process.execPath);
  assert.equal(realpathSync(current.registrations[0].entry.args[0]), realpathSync(path.join(installed(standard.prefix), "dist", "transports", "mcp", "main.js")));
  assert.equal(doctor(standard.prefix, standard.env).status, "healthy");
  assert.ok(readFileSync(path.join(standard.codex, "config.toml"), "utf8").includes('# keep comment\nmodel="existing"'));
  checks.push("one global install: dependencies, user registration, Skill, SDK handshake and doctor");
  const custom = 'export default { instances: { orders: { language: "zh-CN" } } };\n';
  writeFileSync(current.configFile, custom);
  npm(["install", "-g", "--prefix", standard.prefix, "--engine-strict", "--no-audit", "--no-fund", tar], standard.env);
  current = metadata(standard.home);
  assert.deepEqual(current.instances, ["orders"]);
  assert.equal(current.registrations.length, 1);
  assert.equal(readFileSync(current.configFile, "utf8"), custom);
  checks.push("reinstall: no duplicate registrations; custom business instance preserved");
  const newPrefix = path.join(temp, "moved prefix");
  npm(["install", "-g", "--prefix", newPrefix, "--engine-strict", "--no-audit", "--no-fund", tar], standard.env);
  current = metadata(standard.home);
  assert.equal(realpathSync(current.registrations[0].entry.args[0]), realpathSync(path.join(installed(newPrefix), "dist", "transports", "mcp", "main.js")));
  assert.equal(current.registrations.length, 1);
  assert.equal(doctor(newPrefix, standard.env).status, "healthy");
  checks.push("changed global prefix: executable updated and custom business instance retained");
  const disabled = sandbox("disabled");
  npm(["install", "-g", "--prefix", disabled.prefix, "--ignore-scripts", "--engine-strict", "--no-audit", "--no-fund", tar], disabled.env);
  assert.equal(existsSync(path.join(disabled.home, ".intent-runtime", "state.json")), false);
  assert.equal(doctor(disabled.prefix, disabled.env, 1).status, "unhealthy");
  assert.equal(doctor(disabled.prefix, disabled.env, 0, true).status, "healthy");
  checks.push("disabled lifecycle scripts: doctor reports uninitialized; optional repair works");
  const local = sandbox("local");
  const consumer = path.join(temp, "consumer");
  mkdirSync(consumer);
  writeFileSync(path.join(consumer, "package.json"), '{"name":"intent-consumer","version":"1.0.0","private":true}');
  npm(["install", "--engine-strict", "--no-audit", "--no-fund", tar], local.env, consumer);
  assert.equal(existsSync(path.join(local.home, ".intent-runtime", "state.json")), false);
  checks.push("ordinary local installation does not modify client configuration");
  const indirect = sandbox("indirect");
  const parent = path.join(temp, "parent");
  mkdirSync(parent);
  writeFileSync(path.join(parent, "package.json"), JSON.stringify({ name: "intent-parent-fixture", version: "1.0.0", dependencies: { "@devcodex/intent-runtime": "file:" + tar } }));
  const parentPack = JSON.parse(npm(["pack", "--ignore-scripts", "--json", "--pack-destination", temp], indirect.env, parent));
  npm(["install", "-g", "--prefix", indirect.prefix, "--engine-strict", "--no-audit", "--no-fund", path.join(temp, parentPack[0].filename)], indirect.env);
  assert.equal(existsSync(path.join(indirect.home, ".intent-runtime", "state.json")), false);
  checks.push("indirect dependency of a global package does not configure the client");
  const cli = path.join(installed(newPrefix), "dist", "installation", "cli.js");
  assert.equal(JSON.parse(run([cli, "clean", "--json"], standard.env)).status, "cleaned");
  assert.equal(readFileSync(current.configFile, "utf8"), custom);
  assert.equal(JSON.parse(run([cli, "clean", "--json"], standard.env)).status, "cleaned");
  assert.equal(doctor(newPrefix, standard.env, 1).status, "unhealthy");
  assert.equal(doctor(newPrefix, standard.env, 0, true).status, "healthy");
  checks.push("clean twice: removes owned registration/Skill, retains business config; repair restores service");
  console.log(JSON.stringify({ node: process.version, platform: process.platform, checks, providerApiCalls: 0, desktopClientExecuted: false }, null, 2));
  passed = true;
} finally {
  if (passed) rmSync(temp, { recursive: true, force: true });
  else console.error("Failed smoke fixture retained for diagnosis: " + temp);
}
