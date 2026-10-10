import { afterEach, expect, it } from "vitest";
import { access, mkdtemp, mkdir, writeFile, readFile, rm, symlink, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { context, paths, directGlobal, supportedNode } from "../src/installation/environment.js";
import { install, doctor, repair, clean, type InstallOptions } from "../src/installation/installer.js";
import { codex, belongsToModule, type ClientAdapter } from "../src/installation/codex.js";
import { servers, upsert, remove } from "../src/installation/toml.js";
import { read } from "../src/installation/files.js";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture(client = true) {
  const base = await mkdtemp(join(tmpdir(), "intent-install-中文 "));
  roots.push(base);
  const home = join(base, "user"), root = join(base, "module"), cwd = join(base, "project");
  const ctx = context({ home, root, cwd, env: { PATH: "" }, node: process.execPath });
  await mkdir(join(root, "dist", "transports", "mcp"), { recursive: true });
  await mkdir(join(root, "integrations", "codex"), { recursive: true });
  await mkdir(cwd, { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "@devcodex-labs/intent-runtime", version: "test" }));
  // Filesystem unit tests do not install SDKs; dependency resolution uses the
  // real development package while this dummy root supplies fixture assets.
  await symlink(join(process.cwd(), "node_modules"), join(root, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  await writeFile(paths(ctx).main, "// fixture executable; protocol is mocked only in these filesystem tests");
  await writeFile(join(root, "integrations", "codex", "workflow.md"), "Submit the exact input; use real prepare/accept tokens; preserve errors.");
  if (client) await mkdir(join(home, ".codex"), { recursive: true });
  // Native desktop discovery is an integration concern. In filesystem tests,
  // determine presence from this fixture only, without launching PowerShell
  // or finding an application installed on the runner.
  const adapter: ClientAdapter = { ...codex, detect: async candidate => {
    for (const directory of [dirname(paths(candidate).codex), join(candidate.home, ".codex")]) {
      try { await access(directory); return true; } catch { /* fixture absent */ }
    }
    return false;
  } };
  const options: InstallOptions = { adapters: [adapter], probe: async entry => {
    const args = entry.args as string[];
    const text = await readFile(args[args.indexOf("--config") + 1]!, "utf8");
    return { instances: text.includes("orders") ? ["orders"] : ["default"], tools: ["intent_prepare", "intent_accept", "intent_cancel"] };
  } };
  return { base, ctx, options };
}
it("accepts precisely the new minimum major version", () => {
  expect(supportedNode("20.0.0")).toBe(true);
  expect(supportedNode("19.9.0")).toBe(false);
  expect(supportedNode("24.0.0")).toBe(true);
});
it("does not adopt an unrelated executable with the public binary name", async () => {
  const { base, ctx, options } = await fixture();
  const foreign = join(base, "intent-runtime-mcp");
  await writeFile(foreign, "unrelated program");
  const entry = { command: foreign, args: [] };
  await writeFile(paths(ctx).codex, upsert("", "intent-runtime", entry));
  expect(await belongsToModule(entry)).toBe(false);
  expect((await install(ctx, options)).registrations[0]!.name).toBe("intent-runtime-2");
  expect(servers(await readFile(paths(ctx).codex, "utf8"))["intent-runtime"]).toEqual(entry);
});
it("resolves a relative main against its registration cwd rather than the installer cwd", async () => {
  const { base, ctx, options } = await fixture();
  const foreign = join(base, "foreign");
  await mkdir(join(foreign, "dist", "transports", "mcp"), { recursive: true });
  await writeFile(join(foreign, "package.json"), '{"name":"unrelated-plugin"}');
  await writeFile(join(foreign, "dist", "transports", "mcp", "main.js"), "// foreign");
  const entry = { command: process.execPath, args: ["./dist/transports/mcp/main.js"], cwd: foreign };
  await writeFile(paths(ctx).codex, upsert("", "intent-runtime", entry));
  expect((await install({ ...ctx, cwd: ctx.root }, options)).registrations[0]!.name).toBe("intent-runtime-2");
  expect(servers(await readFile(paths(ctx).codex, "utf8"))["intent-runtime"]).toEqual(entry);
});
it("recognizes a verified npm binary target and restores an independent original", async () => {
  const { base, ctx, options } = await fixture();
  const legacy = join(base, "legacy");
  const main = join(legacy, "dist", "transports", "mcp", "main.js");
  await mkdir(dirname(main), { recursive: true });
  await writeFile(join(legacy, "package.json"), '{"name":"@devcodex-labs/intent-runtime"}');
  await writeFile(main, "// independent main");
  const bin = join(base, process.platform === "win32" ? "intent-runtime-mcp.cmd" : "intent-runtime-mcp");
  if (process.platform === "win32") await writeFile(bin, '@ECHO off\n"node" "%dp0%\\legacy\\dist\\transports\\mcp\\main.js" %*\n');
  else await symlink(main, bin, "file");
  const business = join(base, "independent.mjs");
  await writeFile(business, "export default {instances:{default:{}}};");
  const entry = { command: bin, args: ["--config", business] };
  expect(await belongsToModule(entry, ctx)).toBe(true);
  await writeFile(paths(ctx).codex, upsert("", "intent-runtime", entry));
  expect((await install(ctx, options)).registrations[0]!.name).toBe("intent-runtime");
  await clean(ctx, options);
  expect(servers(await readFile(paths(ctx).codex, "utf8"))["intent-runtime"]).toEqual(entry);
});
it("configures a discovered host from arbitrary cwd and preserves unrelated settings", async () => {
  const { ctx, options } = await fixture();
  const before = '# global comment\nmodel="existing"\n[other]\ntoken="kept" # do not rewrite\n';
  await writeFile(paths(ctx).codex, before);
  const result = await install(ctx, options);
  expect(result.status).toBe("configured");
  const source = await readFile(paths(ctx).codex, "utf8");
  expect(source.startsWith(before)).toBe(true);
  expect(servers(source)["intent-runtime"]).toMatchObject({ command: process.execPath, args: [paths(ctx).main, "--config", paths(ctx).config], enabled: true });
  expect(await readFile(result.skills[0]!.path, "utf8")).toContain('Configured instances: ["default"]');
  expect(result.configFile).not.toContain(ctx.cwd);
  expect((await doctor(ctx, options)).status).toBe("healthy");
});
it("reinstall is idempotent and preserves customized business configuration", async () => {
  const { ctx, options } = await fixture();
  await install(ctx, options);
  const source = await readFile(paths(ctx).codex, "utf8");
  const custom = 'export default { instances: { orders: { language: "zh-CN" } } };';
  await writeFile(paths(ctx).config, custom);
  const result = await install(ctx, options);
  expect(await readFile(paths(ctx).codex, "utf8")).toBe(source);
  expect(await readFile(paths(ctx).config, "utf8")).toBe(custom);
  expect(result.registrations).toHaveLength(1);
  expect(result.instances).toEqual(["orders"]);
});
it("preserves a migrated working directory when the config lives elsewhere", async () => {
  const { base, ctx, options } = await fixture();
  const business = join(base, "business"), config = join(base, "configs", "intent.mjs");
  await mkdir(business, { recursive: true });
  await mkdir(dirname(config), { recursive: true });
  await writeFile(join(business, "rules.json"), "business rules");
  await writeFile(config, "export default {instances:{default:{}}};");
  await writeFile(paths(ctx).codex, upsert("", "intent-runtime", { command: ctx.node, args: [paths(ctx).main, "--config", config], cwd: business }));
  const checking: InstallOptions = { ...options, probe: async entry => {
    expect(await readFile(join(entry.cwd as string, "rules.json"), "utf8")).toBe("business rules");
    return { instances: ["default"], tools: [] };
  } };
  expect((await install(ctx, checking)).registrations[0]!.entry.cwd).toBe(business);
  expect((await install(ctx, checking)).registrations[0]!.entry.cwd).toBe(business);
  expect((await doctor(ctx, checking)).status).toBe("healthy");
});
it("performs one protocol probe per unchanged repair and probes again for standalone diagnosis", async () => {
  const { ctx, options } = await fixture();
  let calls = 0;
  const checking: InstallOptions = { ...options, probe: async (entry, candidate) => { calls++; return options.probe!(entry, candidate); } };
  expect((await repair(ctx, checking)).status).toBe("healthy");
  expect(calls).toBe(1);
  expect((await doctor(ctx, checking)).status).toBe("healthy");
  expect(calls).toBe(2);
});
it("does not reuse a probe after the trusted configuration changes", async () => {
  const { ctx, options } = await fixture();
  let calls = 0;
  const checking: InstallOptions = { ...options, probe: async (entry, candidate) => {
    const result = await options.probe!(entry, candidate);
    if (++calls === 1) await writeFile(paths(ctx).config, "export default {instances:{orders:{}}};");
    return result;
  } };
  expect((await repair(ctx, checking)).status).toBe("healthy");
  expect(calls).toBe(2);
});
it("records waiting for a client without claiming successful configuration", async () => {
  const { ctx, options } = await fixture(false);
  expect((await install(ctx, options)).status).toBe("waiting_for_client");
  expect(await read(paths(ctx).codex)).toBeUndefined();
  expect((await doctor(ctx, options)).status).toBe("unhealthy");
});
it("honors custom CODEX_HOME without requiring Codex CLI", async () => {
  const { base, ctx, options } = await fixture(false);
  ctx.env.CODEX_HOME = join(base, "custom codex");
  await mkdir(ctx.env.CODEX_HOME, { recursive: true });
  expect((await install(ctx, options)).registrations[0]!.path).toBe(join(ctx.env.CODEX_HOME, "config.toml"));
});
it("recognizes the existing host when a new CODEX_HOME has not been created", async () => {
  const { base, ctx, options } = await fixture();
  ctx.env.CODEX_HOME = join(base, "new codex home");
  expect((await install(ctx, options)).status).toBe("configured");
  expect(await read(paths(ctx).codex)).toBeDefined();
});
it("preserves a symlinked client configuration during updates", async ({ skip }) => {
  const { base, ctx, options } = await fixture();
  const target = join(base, "dotfiles.toml");
  await writeFile(target, '# linked config\nmodel="existing"\n');
  try { await symlink(target, paths(ctx).codex, "file"); }
  catch (error) {
    if (process.platform === "win32" && (error as NodeJS.ErrnoException).code === "EPERM") skip();
    throw error;
  }
  await install(ctx, options);
  expect((await lstat(paths(ctx).codex)).isSymbolicLink()).toBe(true);
  expect(servers(await readFile(target, "utf8"))["intent-runtime"]).toBeDefined();
  await clean(ctx, options);
  expect((await lstat(paths(ctx).codex)).isSymbolicLink()).toBe(true);
});
it("detects ancestor and selected profile overrides without changing them", async () => {
  const { ctx } = await fixture();
  await writeFile(paths(ctx).codex, 'profile="custom"\n');
  await writeFile(join(ctx.home, ".codex", "custom.config.toml"), '[mcp_servers.intent-runtime]\ncommand="profile-command"\n');
  await mkdir(join(ctx.cwd, ".codex"), { recursive: true });
  await writeFile(join(ctx.cwd, ".codex", "config.toml"), '[mcp_servers.intent-runtime]\ncommand="project-command"\n');
  const child = join(ctx.cwd, "nested");
  await mkdir(child);
  const warnings = await codex.overrides!({ ...ctx, cwd: child }, "intent-runtime");
  expect(warnings.filter(w => w.includes("override"))).toHaveLength(2);
});
it("avoids foreign server and skill collisions with stable names", async () => {
  const { ctx, options } = await fixture();
  const foreign = '[mcp_servers.intent-runtime]\ncommand="foreign"\nargs=[]\n';
  await writeFile(paths(ctx).codex, foreign);
  const foreignSkill = join(paths(ctx).skills, "intent-runtime", "SKILL.md");
  await mkdir(join(paths(ctx).skills, "intent-runtime"), { recursive: true });
  await writeFile(foreignSkill, "foreign instructions");
  const first = await install(ctx, options), second = await install(ctx, options);
  expect(first.registrations[0]!.name).toBe("intent-runtime-2");
  expect(second.registrations).toHaveLength(1);
  expect(second.skills[0]!.name).toBe("intent-runtime-2");
  expect(await readFile(foreignSkill, "utf8")).toBe("foreign instructions");
  expect(servers(await readFile(paths(ctx).codex, "utf8"))["intent-runtime"]).toEqual({ command: "foreign", args: [] });
});
it("migrates a known manual registration and keeps its trusted config path and settings", async () => {
  const { base, ctx, options } = await fixture();
  const config = join(base, "business.mjs");
  await writeFile(config, 'export default {instances:{orders:{}}}; // relative imports must stay in this directory');
  const legacy = join(base, "legacy");
  const main = join(legacy, "dist", "transports", "mcp", "main.js");
  await mkdir(join(legacy, "dist", "transports", "mcp"), { recursive: true });
  await writeFile(join(legacy, "package.json"), '{"name":"@devcodex-labs/intent-runtime"}');
  await writeFile(main, "// legacy source entry");
  const original = { command: process.execPath, args: [main, "--config", config], env: { BUSINESS: "present" }, startup_timeout_sec: 40 };
  await writeFile(paths(ctx).codex, upsert('# keep\n', "intent-runtime", original));
  const result = await install(ctx, options);
  expect(result.configFile).toBe(config);
  expect(result.registrations[0]!.entry).toMatchObject({ env: original.env, startup_timeout_sec: 40 });
  expect(result.instances).toEqual(["orders"]);
  await clean(ctx, options);
  expect(servers(await readFile(paths(ctx).codex, "utf8"))["intent-runtime"]).toEqual(original);
});
it("does not replace a missing existing business config with invented defaults", async () => {
  const { ctx, options } = await fixture();
  const original = upsert('', "intent-runtime", { command: process.execPath, args: [paths(ctx).main, "--config", join(ctx.home, "missing.mjs")] });
  await writeFile(paths(ctx).codex, original);
  await expect(install(ctx, options)).rejects.toMatchObject({ code: "TRUSTED_CONFIG_MISSING" });
  expect(await readFile(paths(ctx).codex, "utf8")).toBe(original);
});
it("rolls back all client changes when protocol verification fails", async () => {
  const { ctx } = await fixture();
  const original = '# only comment\nmodel="keep"\n';
  await writeFile(paths(ctx).codex, original);
  await expect(install(ctx, { probe: async () => { throw new Error("fixture failure"); } })).rejects.toThrow();
  expect(await readFile(paths(ctx).codex, "utf8")).toBe(original);
  expect(await read(paths(ctx).config)).toBeUndefined();
  expect(JSON.parse(await readFile(paths(ctx).state, "utf8")).status).toBe("failed");
});
it("never rewrites malformed client TOML", async () => {
  const { ctx, options } = await fixture();
  await writeFile(paths(ctx).codex, '[broken\n');
  await expect(install(ctx, options)).rejects.toMatchObject({ code: "TOML_INVALID" });
  expect(await readFile(paths(ctx).codex, "utf8")).toBe('[broken\n');
});
it("protects user modifications during cleanup and reports partial completion", async () => {
  const { ctx, options } = await fixture();
  const first = await install(ctx, options);
  const changed = upsert(await readFile(paths(ctx).codex, "utf8"), "intent-runtime", { enabled: false });
  await writeFile(paths(ctx).codex, changed);
  await writeFile(first.skills[0]!.path, "user-customized workflow");
  const result = await clean(ctx, options);
  expect(result.status).toBe("partial");
  expect(result.warnings).toHaveLength(2);
  expect(await readFile(paths(ctx).codex, "utf8")).toBe(changed);
  expect(await readFile(first.skills[0]!.path, "utf8")).toBe("user-customized workflow");
});
it("cleanup is idempotent and reinstall can configure again", async () => {
  const { ctx, options } = await fixture();
  const first = await install(ctx, options);
  await clean(ctx, options);
  expect(servers(await readFile(paths(ctx).codex, "utf8"))["intent-runtime"]).toBeUndefined();
  expect(await read(first.skills[0]!.path)).toBeUndefined();
  expect(await read(paths(ctx).config)).toBeDefined();
  expect((await clean(ctx, options)).status).toBe("cleaned");
  expect((await install(ctx, options)).status).toBe("configured");
});
it("does not restore an old registration that relies on the global package being removed", async () => {
  const { base, ctx, options } = await fixture();
  const business = join(base, "business.mjs");
  await writeFile(business, 'export default {instances:{orders:{}}};');
  await writeFile(paths(ctx).codex, upsert('', "intent-runtime", { command: process.execPath, args: [paths(ctx).main, "--config", business] }));
  await install(ctx, options);
  expect((await clean(ctx, options)).status).toBe("cleaned");
  expect(servers(await readFile(paths(ctx).codex, "utf8"))["intent-runtime"]).toBeUndefined();
});
it("doctor notices disabled and overridden registrations without changing config", async () => {
  const { ctx, options } = await fixture();
  await install(ctx, options);
  await mkdir(join(ctx.cwd, ".codex"), { recursive: true });
  await writeFile(join(ctx.cwd, ".codex", "config.toml"), '[mcp_servers.intent-runtime]\ncommand="other"\n');
  expect((await doctor(ctx, options)).warnings.some(w => w.includes("override"))).toBe(true);
  const before = upsert(await readFile(paths(ctx).codex, "utf8"), "intent-runtime", { enabled: false });
  await writeFile(paths(ctx).codex, before);
  expect((await doctor(ctx, options)).status).toBe("unhealthy");
  expect(await readFile(paths(ctx).codex, "utf8")).toBe(before);
});
it("preserves a user-edited workflow on upgrade", async () => {
  const { ctx, options } = await fixture();
  const first = await install(ctx, options);
  await writeFile(first.skills[0]!.path, "custom workflow");
  const next = await install(ctx, options);
  expect(next.warnings.some(w => w.includes("User-edited"))).toBe(true);
  expect(await readFile(first.skills[0]!.path, "utf8")).toBe("custom workflow");
});
it("refuses a live operation lock and recovers a dead process lock", async () => {
  const { ctx, options } = await fixture();
  await mkdir(paths(ctx).base, { recursive: true });
  await writeFile(paths(ctx).lock, JSON.stringify({ pid: process.pid }));
  await expect(install(ctx, options)).rejects.toMatchObject({ code: "INSTALL_BUSY" });
  await writeFile(paths(ctx).lock, JSON.stringify({ pid: 2147483647 }));
  expect((await install(ctx, options)).status).toBe("configured");
  expect(await read(paths(ctx).lock)).toBeUndefined();
});
it("does not overwrite corrupted management records", async () => {
  const { ctx, options } = await fixture();
  await mkdir(paths(ctx).base, { recursive: true });
  await writeFile(paths(ctx).state, 'not JSON');
  await expect(install(ctx, options)).rejects.toMatchObject({ code: "STATE_INVALID" });
  expect(await readFile(paths(ctx).state, "utf8")).toBe('not JSON');
});
it("distinguishes top-level global modules from global indirect dependencies", async () => {
  const { base, ctx } = await fixture();
  const prefix = join(base, "prefix");
  const global = join(prefix, "lib", "node_modules", "@devcodex-labs", "intent-runtime");
  await mkdir(global, { recursive: true });
  ctx.env.npm_config_global = "true";
  ctx.env.npm_config_prefix = prefix;
  expect(directGlobal({ ...ctx, root: global, platform: "linux" })).toBe(true);
  expect(directGlobal({ ...ctx, platform: "linux" })).toBe(false);
  expect(directGlobal({ ...ctx, root: global, env: {} })).toBe(false);
});
it("does not initialize a development npm link", async () => {
  const { base, ctx } = await fixture();
  const prefix = join(base, "linked-prefix");
  const parent = join(prefix, "lib", "node_modules", "@devcodex-labs");
  await mkdir(parent, { recursive: true });
  await symlink(ctx.root, join(parent, "intent-runtime"), process.platform === "win32" ? "junction" : "dir");
  expect(directGlobal({ ...ctx, platform: "linux", env: { npm_config_global: "true", npm_config_prefix: prefix } })).toBe(false);
});
it("supports an adapter with a different configuration format", async () => {
  const { ctx, options } = await fixture();
  const adapter: ClientAdapter = {
    id: "fixture-json", detect: async () => true, config: () => join(ctx.home, "client.json"),
    entries: source => source ? JSON.parse(source) : {},
    write: (source, name, entry) => JSON.stringify({ ...(source ? JSON.parse(source) : {}), [name]: entry }),
    remove: (source, name) => { const value = JSON.parse(source); delete value[name]; return JSON.stringify(value); },
    fingerprint: (source, name) => JSON.stringify(JSON.parse(source)[name]),
    instruction: (_, name, body) => ({ path: join(ctx.home, name + ".md"), content: body }),
  };
  const result = await install(ctx, { ...options, adapters: [adapter] });
  expect(result.registrations[0]!.client).toBe("fixture-json");
  expect((await clean(ctx, { ...options, adapters: [adapter] })).status).toBe("cleaned");
});
it("retains successfully configured clients when another adapter fails", async () => {
  const { ctx, options } = await fixture();
  const first: ClientAdapter = { ...codex, id: "first", detect: async () => true, config: () => join(ctx.home, "first.toml") };
  const second: ClientAdapter = { ...codex, id: "second", detect: async () => true, config: () => join(ctx.home, "second.toml") };
  await writeFile(second.config(ctx), '[broken\n');
  await expect(install(ctx, { ...options, adapters: [first, second] })).rejects.toMatchObject({ code: "TOML_INVALID" });
  const saved = JSON.parse(await readFile(paths(ctx).state, "utf8"));
  expect(saved.status).toBe("failed");
  expect(saved.registrations.map((r: { client: string }) => r.client)).toEqual(["first"]);
  expect(servers(await readFile(first.config(ctx), "utf8"))["intent-runtime"]).toBeDefined();
  expect(await readFile(second.config(ctx), "utf8")).toBe('[broken\n');
});
it.each([
  '[mcp_servers."keep.dot"]\ncommand="foreign" # inline comment\nargs=["C:\\\\路径\\\\a"]\n',
  'mcp_servers = { "keep.dot" = { command = "foreign", args = [] } }\n',
  'mcp_servers."keep.dot".command = "foreign"\nmcp_servers."keep.dot".args = []\n',
  'mcp_servers = { "keep.dot".command = "foreign", "keep.dot".args = [] }\n',
])("edits and removes one server while preserving other TOML forms: %s", source => {
  const before = servers(source)["keep.dot"];
  const changed = upsert(source, "intent-runtime", { command: "node", args: ["a", "--config", "b"], cwd: "工作 目录" });
  expect(servers(changed)["keep.dot"]).toEqual(before);
  expect(servers(changed)["intent-runtime"]).toMatchObject({ command: "node", cwd: "工作 目录" });
  expect(servers(remove(changed, "intent-runtime"))["keep.dot"]).toEqual(before);
});
it("removes nested env tables without deleting surrounding comments or servers", () => {
  const source = '# before\n[mcp_servers.intent-runtime] # header comment\ncommand="node" # value comment\n[mcp_servers.intent-runtime.env]\nA="b"\n# next server\n[mcp_servers.other]\ncommand="other"\n';
  const result = remove(source, "intent-runtime");
  expect(servers(result)).toEqual({ other: { command: "other" } });
  expect(result).toContain("# header comment");
  expect(result).toContain("# value comment");
  expect(result).toContain("# next server");
});
