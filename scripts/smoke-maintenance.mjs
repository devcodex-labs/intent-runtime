import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync, cpSync, copyFileSync, chmodSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

const root = process.cwd();
const temp = mkdtempSync(path.join(tmpdir(), "intent-maintenance-中文 "));
const checks = [];
const children = new Set();
let passed = false;
function run(args, env, expected = 0, cwd = temp, timeout = 30000) {
  try {
    const output = execFileSync(process.execPath, args, { cwd, env: { ...process.env, ...env }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout });
    assert.equal(expected, 0, "Expected command failure");
    return output;
  } catch (error) {
    if (error.status !== expected) throw new Error("Command failed: " + args.join(" ") + "\n" + error.stdout + "\n" + error.stderr, { cause: error });
    return String(error.stdout);
  }
}
function npm(args, env, cwd = temp) {
  assert.ok(process.env.npm_execpath, "Run through npm run smoke:maintenance");
  return run([process.env.npm_execpath, ...args], env, 0, cwd, 180000);
}
function sandbox(name) {
  const home = path.join(temp, name, "user 中文 space");
  const prefix = path.join(temp, name, "global prefix");
  const codex = path.join(home, ".codex");
  mkdirSync(codex, { recursive: true });
  const env = { INTENT_RUNTIME_USER_HOME: home, CODEX_HOME: codex, INTENT_RUNTIME_SKIP_AUTO_CONFIG: "0", npm_config_ignore_scripts: "false", npm_config_cache: process.env.npm_config_cache ?? path.join(temp, "cache") };
  const base = path.join(home, ".intent-runtime");
  return { home, prefix, codex, env, base };
}
function installed(host) { return path.join(host.prefix, ...(process.platform === "win32" ? [] : ["lib"]), "node_modules", "@devcodex-labs", "intent-runtime"); }
function cli(host) { return path.join(installed(host), "dist", "installation", "cli.js"); }
function state(host) { return JSON.parse(readFileSync(path.join(host.base, "state.json"), "utf8")); }
function doctor(host, repair = false, expected = 0) { return JSON.parse(run([cli(host), "doctor", "--json", ...(repair ? ["--repair"] : [])], host.env, expected)); }
function launch(args, env) {
  const child = spawn(process.execPath, args, { cwd: temp, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  children.add(child);
  let stdout = "", stderr = "";
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });
  const closed = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => { children.delete(child); resolve({ code, signal, stdout, stderr }); });
  });
  return { child, closed };
}
async function holder(host, changeFiles = false) {
  const program = path.join(temp, "holder-" + (changeFiles ? "interrupted" : "concurrent") + "-" + randomUUID() + ".mjs");
  const files = pathToFileURL(path.join(installed(host), "dist", "installation", "files.js")).href;
  const environment = pathToFileURL(path.join(installed(host), "dist", "installation", "environment.js")).href;
  const changes = changeFiles ? `
    const recovery = new RecoveryJournal(p.base);
    await recovery.recover();
    const tx = new Transaction(p.base, recovery);
    await tx.change(p.codex, "# interrupted registration\\n");
    await tx.change(p.config, "export default {instances:{default:{}}};\\n");
    await tx.change(p.state, '{"partial":true}');
    await tx.change(${JSON.stringify(path.join(host.home, ".agents", "skills", "intent-runtime", "SKILL.md"))}, "interrupted instructions");` : "";
  writeFileSync(program, `import {locked,RecoveryJournal,Transaction} from ${JSON.stringify(files)};
import {context,paths} from ${JSON.stringify(environment)};
const ctx=context(); const p=paths(ctx);
await locked(ctx,async()=>{${changes}
process.stdout.write("ready\\n");setInterval(()=>{},1000);await new Promise(()=>{});});\n`);
  const running = launch([program], host.env);
  let timer;
  try {
    await Promise.race([
      new Promise(resolve => { running.child.stdout.on("data", chunk => { if (String(chunk).includes("ready")) resolve(); }); }),
      running.closed.then(result => { throw new Error("Holder exited before ready: " + JSON.stringify(result)); }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Holder start timed out")), 30000); }),
    ]);
    return running;
  } finally { clearTimeout(timer); }
}
async function stop(running) { running.child.kill("SIGKILL"); await running.closed; }

try {
  const packed = JSON.parse(npm(["pack", "--json", "--pack-destination", temp], { npm_config_cache: process.env.npm_config_cache ?? path.join(temp, "cache") }, root));
  const tar = path.join(temp, packed[0].filename);
  const interrupted = sandbox("interrupted");
  const original = '# user comment\nmodel="keep"\n';
  writeFileSync(path.join(interrupted.codex, "config.toml"), original);
  npm(["install", "-g", "--prefix", interrupted.prefix, "--ignore-scripts", "--engine-strict", "--no-audit", "--no-fund", tar], interrupted.env);
  const held = await holder(interrupted);
  const competitions = await Promise.all([
    launch([cli(interrupted), "doctor", "--repair", "--json"], interrupted.env).closed,
    launch([cli(interrupted), "clean", "--json"], interrupted.env).closed,
    launch([cli(interrupted), "doctor", "--repair", "--json"], interrupted.env).closed,
  ]);
  for (const result of competitions) {
    assert.equal(result.code, 1);
    assert.equal(JSON.parse(result.stdout).code, "INSTALL_BUSY");
  }
  assert.equal(readFileSync(path.join(interrupted.codex, "config.toml"), "utf8"), original);
  await stop(held);
  const reclaimers = await Promise.allSettled(Array.from({ length: 6 }, () => holder(interrupted)));
  const winners = reclaimers.filter(result => result.status === "fulfilled");
  assert.equal(winners.length, 1, "Only one real process may reclaim and hold the dead owner's lock");
  for (const result of reclaimers) if (result.status === "rejected") assert.match(String(result.reason), /INSTALL_BUSY/);
  await stop(winners[0].value);
  assert.equal(doctor(interrupted, true).status, "healthy");
  checks.push("live-owner competitors are refused; six real stale-lock reclaimers have exactly one holder; killed holders are reclaimable");
  JSON.parse(run([cli(interrupted), "clean", "--json"], interrupted.env));
  writeFileSync(path.join(interrupted.codex, "config.toml"), original);
  rmSync(path.join(interrupted.base, "state.json"));
  const crashed = await holder(interrupted, true);
  assert.ok(existsSync(path.join(interrupted.base, "pending-operation.json")));
  await stop(crashed);
  assert.equal(doctor(interrupted, false, 1).status, "unhealthy");
  assert.equal(doctor(interrupted, true).status, "healthy");
  assert.equal(state(interrupted).registrations.length, 1);
  assert.equal(state(interrupted).skills.length, 1);
  assert.equal(state(interrupted).skills[0].name, "intent-runtime");
  assert.equal(existsSync(path.join(interrupted.base, "pending-operation.json")), false);
  assert.ok(readFileSync(path.join(interrupted.codex, "config.toml"), "utf8").startsWith(original));
  checks.push("SIGKILL after registration/config/state/Skill writes: recovery restores originals before repair and produces no duplicate registrations or Skills");

  const migrated = sandbox("migrated");
  npm(["install", "-g", "--prefix", migrated.prefix, "--ignore-scripts", "--engine-strict", "--no-audit", "--no-fund", tar], migrated.env);
  const business = path.join(temp, "business 中文 imports");
  mkdirSync(business);
  symlinkSync(path.join(root, "node_modules"), path.join(business, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  writeFileSync(path.join(business, "schema.mjs"), 'import {s} from "schema-dsl/pure";export const schema=s({orderId:s("string!")});\n');
  const configDirectory = path.join(business, "configs");
  mkdirSync(configDirectory);
  const config = path.join(configDirectory, "intent.config.mjs");
  const startups = path.join(business, "startups.log");
  writeFileSync(path.join(business, "rules.json"), "business rules");
  const configText = 'import {schema} from "../schema.mjs";\nimport {existsSync,appendFileSync,readFileSync} from "node:fs";\nif(readFileSync("rules.json","utf8")!=="business rules")throw new Error("fixture working directory changed");\nif(process.env.INTENT_ENV_INLINE!=="inline-ok"||process.env.INTENT_ENV_PASS!=="pass-ok")throw new Error("fixture environment missing");\nconst first=!existsSync(' + JSON.stringify(startups) + ');\nappendFileSync(' + JSON.stringify(startups) + ',"start\\n");\nif(first)await new Promise(resolve=>setTimeout(resolve,11000));\nexport default {instances:{orders:{schema},secondary:{}}};\n';
  writeFileSync(config, configText);
  writeFileSync(path.join(migrated.codex, "config.toml"), '[mcp_servers.intent-runtime]\ncommand=' + JSON.stringify(process.execPath) + '\nargs=' + JSON.stringify([path.join(root, "dist", "transports", "mcp", "main.js"), "--config", config]) + '\ncwd=' + JSON.stringify(business) + '\nenv={INTENT_ENV_INLINE="inline-ok"}\nenv_vars=["INTENT_ENV_PASS"]\nstartup_timeout_sec=30\n');
  migrated.env.INTENT_ENV_PASS = "pass-ok";
  assert.equal(doctor(migrated, true).status, "healthy");
  assert.equal(state(migrated).configFile, config);
  assert.deepEqual(state(migrated).instances, ["orders", "secondary"]);
  assert.equal(state(migrated).registrations[0].entry.startup_timeout_sec, 30);
  assert.equal(state(migrated).registrations[0].entry.cwd, business);
  assert.equal(readFileSync(startups, "utf8").trim().split("\n").length, 1);
  assert.equal(readFileSync(config, "utf8"), configText);
  checks.push("actual legacy migration retains cwd distinct from config directory, relative/bare imports, env/env_vars and multiple instances; an 11-second startup succeeds and repair probes once");

  const candidate = path.join(temp, "version candidate");
  cpSync(installed(migrated), candidate, { recursive: true, filter: source => path.relative(installed(migrated), source).split(path.sep)[0] !== "node_modules" });
  const manifestFile = path.join(candidate, "package.json");
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
  manifest.version = "1.0.0-dev.1";
  writeFileSync(manifestFile, JSON.stringify(manifest));
  const candidatePack = JSON.parse(npm(["pack", "--ignore-scripts", "--json", "--pack-destination", temp], migrated.env, candidate));
  npm(["install", "-g", "--prefix", migrated.prefix, "--engine-strict", "--no-audit", "--no-fund", path.join(temp, candidatePack[0].filename)], migrated.env);
  assert.equal(state(migrated).version, "1.0.0-dev.1");
  assert.equal(doctor(migrated).status, "healthy");
  npm(["install", "-g", "--prefix", migrated.prefix, "--engine-strict", "--no-audit", "--no-fund", tar], migrated.env);
  assert.equal(state(migrated).version, packed[0].version);
  assert.equal(doctor(migrated).status, "healthy");
  assert.equal(state(migrated).registrations.length, 1);
  assert.equal(readFileSync(config, "utf8"), configText);
  checks.push("real npm upgrade/downgrade between fixture package versions retains business config and a single registration");

  const alternative = path.join(temp, process.platform === "win32" ? "alternate-node.exe" : "alternate-node");
  copyFileSync(process.execPath, alternative);
  chmodSync(alternative, 0o700);
  execFileSync(alternative, [cli(migrated), "doctor", "--repair", "--json"], { env: { ...process.env, ...migrated.env }, cwd: temp, timeout: 30000 });
  assert.equal(realpathSync(state(migrated).registrations[0].entry.command), realpathSync(alternative));
  rmSync(alternative);
  assert.equal(doctor(migrated, false, 1).status, "unhealthy");
  assert.equal(doctor(migrated, true).status, "healthy");
  assert.equal(state(migrated).registrations[0].entry.command, process.execPath);
  checks.push("a removed prior Node executable is diagnosed; repair updates the owned registration to the active executable");

  JSON.parse(run([cli(migrated), "clean", "--json"], migrated.env));
  npm(["uninstall", "-g", "--prefix", migrated.prefix, "--no-audit", "--no-fund", "@devcodex-labs/intent-runtime"], migrated.env);
  assert.equal(existsSync(installed(migrated)), false);
  assert.equal(readFileSync(config, "utf8"), configText);
  npm(["install", "-g", "--prefix", migrated.prefix, "--engine-strict", "--no-audit", "--no-fund", tar], migrated.env);
  assert.equal(doctor(migrated).status, "healthy");
  assert.equal(state(migrated).registrations.length, 1);
  assert.equal(readFileSync(config, "utf8"), configText);
  checks.push("clean followed by real npm uninstall/reinstall preserves independent business files and restores service");
  console.log(JSON.stringify({ node: process.version, platform: process.platform, checks, candidateVersions: [packed[0].version, "1.0.0-dev.1"], providerApiCalls: 0, desktopClientExecuted: false, modelDrivenToolInvocationTested: false }, null, 2));
  passed = true;
} finally {
  for (const child of children) child.kill("SIGKILL");
  if (passed) rmSync(temp, { recursive: true, force: true, maxRetries: 3 });
  else console.error("Failed maintenance fixture retained: " + temp);
}
