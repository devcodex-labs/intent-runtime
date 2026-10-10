import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, readlink, rm, symlink, lstat, chmod } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { context, paths } from "../src/installation/environment.js";
import { install, doctor, clean, type InstallOptions } from "../src/installation/installer.js";
import { codex } from "../src/installation/codex.js";
import { atomic, locked, read, RecoveryJournal, Transaction } from "../src/installation/files.js";

const faults = vi.hoisted(() => ({ hook: undefined as ((operation: string, path: string) => void) | undefined }));
vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    writeFile: async (...args: Parameters<typeof actual.writeFile>) => { faults.hook?.("writeFile", String(args[0])); return actual.writeFile(...args); },
    rename: async (...args: Parameters<typeof actual.rename>) => { faults.hook?.("rename", String(args[1])); return actual.rename(...args); },
    appendFile: async (...args: Parameters<typeof actual.appendFile>) => { faults.hook?.("appendFile", String(args[0])); return actual.appendFile(...args); },
    open: async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args);
      const write = handle.writeFile.bind(handle);
      handle.writeFile = async (...values: Parameters<typeof handle.writeFile>) => { faults.hook?.("handle.writeFile", String(args[0])); return write(...values); };
      return handle;
    },
  };
});

const roots: string[] = [];
afterEach(async () => {
  faults.hook = undefined;
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true, maxRetries: 3 });
});
async function fixture() {
  const base = await mkdtemp(join(tmpdir(), "intent-fault-中文 "));
  roots.push(base);
  const ctx = context({ home: join(base, "user"), root: join(base, "module"), cwd: base, env: { PATH: "" } });
  await mkdir(join(ctx.root, "dist", "transports", "mcp"), { recursive: true });
  await mkdir(join(ctx.root, "integrations", "codex"), { recursive: true });
  await symlink(join(process.cwd(), "node_modules"), join(ctx.root, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  await writeFile(join(ctx.root, "package.json"), '{"name":"@devcodex-labs/intent-runtime","version":"test"}');
  await writeFile(paths(ctx).main, "// unit fixture; probe supplied explicitly");
  await writeFile(join(ctx.root, "integrations", "codex", "workflow.md"), "Use the actual MCP tasks.");
  await mkdir(join(ctx.home, ".codex"), { recursive: true });
  const before = '# user content\nmodel="keep"\n';
  await writeFile(paths(ctx).codex, before);
  const options: InstallOptions = { adapters: [{ ...codex, detect: async () => true }], probe: async () => ({ instances: ["default"], tools: ["intent_prepare", "intent_accept", "intent_cancel"] }) };
  return { ctx, options, before, base };
}
function fail(operation: string, fragment: string, code: string, once = true) {
  let available = true;
  faults.hook = (current, path) => {
    if (available && current === operation && path.includes(fragment)) {
      if (once) available = false;
      throw Object.assign(new Error("injected filesystem failure"), { code, path });
    }
  };
}
it.each(["install", "clean"])("preserves an edit after %s transforms its source snapshot", async operation => {
  const { ctx, options } = await fixture();
  if (operation === "clean") await install(ctx, options);
  const before = await readFile(paths(ctx).codex, "utf8");
  const edited = 'model_reasoning_effort="high"\n' + before;
  const adapter = { ...codex, detect: async () => true };
  const method = operation === "install" ? "write" : "remove";
  const transform = adapter[method].bind(adapter);
  adapter[method] = (source, name, ...args: [Record<string, unknown>?]) => {
    const updated = transform(source, name, args[0]!);
    writeFileSync(paths(ctx).codex, edited);
    return updated;
  };
  const configured = { ...options, adapters: [adapter] };
  await expect(operation === "install" ? install(ctx, configured) : clean(ctx, configured)).rejects.toMatchObject({ code: "CONFIG_CHANGED" });
  expect(await readFile(paths(ctx).codex, "utf8")).toBe(edited);
});
it("serializes all contenders reclaiming a real dead-process lock", async () => {
  const { ctx } = await fixture();
  const exited = spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
  await new Promise<void>((resolve, reject) => { exited.once("exit", () => resolve()); exited.once("error", reject); });
  await mkdir(paths(ctx).base, { recursive: true });
  await writeFile(paths(ctx).lock, JSON.stringify({ pid: exited.pid, id: "dead-owner" }));
  let release!: () => void, entered!: () => void, winner = -1, count = 0;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { entered = resolve; });
  const competitors = Array.from({ length: 8 }, (_, index) => locked(ctx, async () => {
    winner = index; count++; entered(); await gate; return "done";
  }).then(value => ({ value }), error => ({ error: error as { code: string } })));
  try {
    await ready;
    const failures = await Promise.all(competitors.filter((_, index) => index !== winner));
    expect(count).toBe(1);
    expect(failures.every(result => "error" in result && result.error.code === "INSTALL_BUSY")).toBe(true);
    expect(JSON.parse(await readFile(paths(ctx).lock, "utf8")).pid).toBe(process.pid);
  } finally { release(); await Promise.all(competitors); }
  expect(await read(paths(ctx).lock)).toBeUndefined();
});
it.each([
  ["writeFile", "intent.config.mjs.", "ENOSPC"],
  ["rename", "config.toml", "EBUSY"],
  ["writeFile", "pending-operation.json.", "ENOSPC"],
  ["writeFile", "state.json.", "ENOSPC"],
  ["appendFile", "installation.jsonl", "EACCES"],
  ["handle.writeFile", "install.lock", "ENOSPC"],
])("restores user files and can retry after %s %s %s", async (operation, fragment, code) => {
  const { ctx, options, before } = await fixture();
  fail(operation, fragment, code);
  await expect(install(ctx, options)).rejects.toMatchObject({ code });
  faults.hook = undefined;
  expect(await readFile(paths(ctx).codex, "utf8")).toBe(before);
  expect(await read(paths(ctx).config)).toBeUndefined();
  expect(await read(paths(ctx).lock)).toBeUndefined();
  expect(await read(join(paths(ctx).base, "pending-operation.json"))).toBeUndefined();
  expect((await install(ctx, options)).status).toBe("configured");
});
it("attempts every rollback and retains a recoverable record when restoration is blocked", async () => {
  const { ctx, options, before } = await fixture();
  await expect(install(ctx, { ...options, probe: async () => {
    fail("rename", "config.toml", "EACCES", false);
    throw new Error("protocol failure");
  } })).rejects.toMatchObject({ code: "ROLLBACK_INCOMPLETE" });
  faults.hook = undefined;
  expect(await read(paths(ctx).config)).toBeUndefined();
  expect(await read(paths(ctx).lock)).toBeUndefined();
  expect(await read(join(paths(ctx).base, "pending-operation.json"))).toBeDefined();
  expect((await doctor(ctx, options)).checks.some(c => c.name === "recovery" && !c.ok)).toBe(true);
  await new RecoveryJournal(paths(ctx).base).recover();
  expect(await readFile(paths(ctx).codex, "utf8")).toBe(before);
  expect((await install(ctx, options)).status).toBe("configured");
  await clean(ctx, options);
  expect((await readFile(paths(ctx).codex, "utf8")).trimEnd()).toBe(before.trimEnd());
});
it("preserves concurrent user edits when a failing probe requires rollback", async () => {
  const { ctx, options, before } = await fixture();
  const user = 'export default {instances:{orders:{}}}; // user edit';
  await expect(install(ctx, { ...options, probe: async () => {
    await writeFile(paths(ctx).config, user);
    throw new Error("probe failed after user edited the file");
  } })).rejects.toMatchObject({ code: "ROLLBACK_INCOMPLETE" });
  expect(await readFile(paths(ctx).config, "utf8")).toBe(user);
  expect(await readFile(paths(ctx).codex, "utf8")).toBe(before);
  await expect(install(ctx, options)).rejects.toMatchObject({ code: "RECOVERY_CONFLICT" });
  expect(await readFile(paths(ctx).config, "utf8")).toBe(user);
});
it("detects user edits made while an atomic replacement is being prepared", async () => {
  const { ctx, options } = await fixture();
  const user = '# user changed settings during installation\nmodel="new"\n';
  faults.hook = (operation, path) => {
    if (operation === "writeFile" && path.includes("config.toml.")) {
      faults.hook = undefined;
      writeFileSync(paths(ctx).codex, user);
    }
  };
  await expect(install(ctx, options)).rejects.toMatchObject({ code: "ROLLBACK_INCOMPLETE" });
  expect(await readFile(paths(ctx).codex, "utf8")).toBe(user);
  expect(await read(paths(ctx).config)).toBeUndefined();
});
it.skipIf(process.platform === "win32" || process.getuid?.() === 0)("handles actual directory write permissions without modifying user files", async () => {
  const { ctx, options, before } = await fixture();
  const directory = join(ctx.home, ".codex");
  await chmod(directory, 0o500);
  try { await expect(install(ctx, options)).rejects.toMatchObject({ code: "EACCES" }); }
  finally { await chmod(directory, 0o700); }
  expect(await readFile(paths(ctx).codex, "utf8")).toBe(before);
  expect(await read(paths(ctx).config)).toBeUndefined();
  expect(await read(paths(ctx).lock)).toBeUndefined();
  expect((await install(ctx, options)).status).toBe("configured");
});
it("restores a registration and its Skill when cleanup cannot persist its state", async () => {
  const { ctx, options } = await fixture();
  const previous = await install(ctx, options);
  const registration = await readFile(paths(ctx).codex, "utf8");
  const instruction = await readFile(previous.skills[0]!.path, "utf8");
  const business = await readFile(paths(ctx).config, "utf8");
  fail("writeFile", "state.json.", "ENOSPC");
  await expect(clean(ctx, options)).rejects.toMatchObject({ code: "ENOSPC" });
  faults.hook = undefined;
  expect(await readFile(paths(ctx).codex, "utf8")).toBe(registration);
  expect(await readFile(previous.skills[0]!.path, "utf8")).toBe(instruction);
  expect(await readFile(paths(ctx).config, "utf8")).toBe(business);
  expect((await doctor(ctx, options)).status).toBe("healthy");
  expect((await clean(ctx, options)).status).toBe("cleaned");
});
it("never replaces a missing established business config with a fresh default", async () => {
  const { ctx, options } = await fixture();
  await install(ctx, options);
  await rm(paths(ctx).config);
  const before = await readFile(paths(ctx).codex, "utf8");
  await expect(install(ctx, options)).rejects.toMatchObject({ code: "TRUSTED_CONFIG_MISSING" });
  expect(await read(paths(ctx).config)).toBeUndefined();
  expect(await readFile(paths(ctx).codex, "utf8")).toBe(before);
});
it("preserves a same-content user Skill symlink through cleanup failure and repair", async ({ skip }) => {
  const { ctx, options, base } = await fixture();
  const previous = await install(ctx, options);
  const skill = previous.skills[0]!.path, target = join(base, "user-instructions.md");
  const content = await readFile(skill, "utf8");
  await writeFile(target, content);
  await rm(skill);
  try { await symlink(target, skill, "file"); }
  catch (error) {
    if (process.platform === "win32" && (error as NodeJS.ErrnoException).code === "EPERM") skip();
    throw error;
  }
  const registration = await readFile(paths(ctx).codex, "utf8");
  expect((await doctor(ctx, options)).warnings).toContain("User-edited instruction preserved: " + skill);
  fail("writeFile", "state.json.", "ENOSPC");
  await expect(clean(ctx, options)).rejects.toMatchObject({ code: "ENOSPC" });
  faults.hook = undefined;
  expect((await lstat(skill)).isSymbolicLink()).toBe(true);
  expect(await readlink(skill)).toBe(target);
  expect(await readFile(target, "utf8")).toBe(content);
  expect(await readFile(paths(ctx).codex, "utf8")).toBe(registration);
  expect((await install(ctx, options)).warnings).toContain("User-edited instruction preserved: " + skill);
  expect((await clean(ctx, options)).status).toBe("partial");
  expect((await lstat(skill)).isSymbolicLink()).toBe(true);
});
it("reclaims a failed lock write without retaining an invalid lock", async () => {
  const { ctx } = await fixture();
  fail("handle.writeFile", "install.lock", "ENOSPC");
  await expect(locked(ctx, async () => "unused")).rejects.toMatchObject({ code: "ENOSPC" });
  expect(await read(paths(ctx).lock)).toBeUndefined();
  faults.hook = undefined;
  expect(await locked(ctx, async () => "ready")).toBe("ready");
});
it("refuses invalid locks without altering their content", async () => {
  const { ctx, options } = await fixture();
  await mkdir(paths(ctx).base, { recursive: true });
  await writeFile(paths(ctx).lock, "invalid owner");
  await expect(install(ctx, options)).rejects.toMatchObject({ code: "LOCK_INVALID" });
  expect(await readFile(paths(ctx).lock, "utf8")).toBe("invalid owner");
});
it.each(["status", "node", "updatedAt", "checks", "registrations"])("protects a valid JSON state missing %s", async field => {
  const { ctx, options } = await fixture();
  await install(ctx, options);
  const previous = JSON.parse(await readFile(paths(ctx).state, "utf8")) as Record<string, unknown>;
  delete previous[field];
  const source = JSON.stringify(previous);
  const client = await readFile(paths(ctx).codex, "utf8");
  await writeFile(paths(ctx).state, source);
  await expect(install(ctx, options)).rejects.toMatchObject({ code: "STATE_INVALID" });
  expect(await readFile(paths(ctx).state, "utf8")).toBe(source);
  expect(await readFile(paths(ctx).codex, "utf8")).toBe(client);
});
it.each(["main", "workflow"])("reports missing packaged %s before changing client files", async asset => {
  const { ctx, options, before } = await fixture();
  await rm(asset === "main" ? paths(ctx).main : join(ctx.root, "integrations", "codex", "workflow.md"));
  await expect(install(ctx, options)).rejects.toMatchObject({ code: asset === "main" ? "BUILD_MISSING" : "WORKFLOW_MISSING" });
  expect(await readFile(paths(ctx).codex, "utf8")).toBe(before);
});
it("keeps a broken configuration symlink without creating its target", async ({ skip }) => {
  const { ctx, options, base } = await fixture();
  await rm(paths(ctx).codex);
  const missing = join(base, "absent-target.toml");
  try { await symlink(missing, paths(ctx).codex, "file"); }
  catch (error) {
    if (process.platform === "win32" && (error as NodeJS.ErrnoException).code === "EPERM") skip();
    throw error;
  }
  await expect(install(ctx, options)).rejects.toMatchObject({ code: "CONFIG_SYMLINK_BROKEN" });
  expect((await lstat(paths(ctx).codex)).isSymbolicLink()).toBe(true);
  expect(await read(missing)).toBeUndefined();
});
it("rejects a relative legacy config without an absolute working directory", async () => {
  const { ctx, options } = await fixture();
  const before = '[mcp_servers.intent-runtime]\ncommand=' + JSON.stringify(process.execPath) + '\nargs=' + JSON.stringify([paths(ctx).main, "--config", "relative.mjs"]) + '\n';
  await writeFile(paths(ctx).codex, before);
  await expect(install(ctx, options)).rejects.toMatchObject({ code: "CONFIG_PATH_AMBIGUOUS" });
  expect(await readFile(paths(ctx).codex, "utf8")).toBe(before);
});
it("recovers only its own interrupted changes and preserves unrelated files", async () => {
  const { ctx, before, base } = await fixture();
  const recovery = new RecoveryJournal(paths(ctx).base);
  const tx = new Transaction(paths(ctx).base, recovery);
  const unrelated = join(base, "unrelated.txt");
  await writeFile(unrelated, "keep");
  await tx.change(paths(ctx).codex, "interrupted configuration");
  await tx.change(paths(ctx).config, "interrupted business config");
  await new RecoveryJournal(paths(ctx).base).recover();
  expect(await readFile(paths(ctx).codex, "utf8")).toBe(before);
  expect(await read(paths(ctx).config)).toBeUndefined();
  expect(await readFile(unrelated, "utf8")).toBe("keep");
});
it("retains invalid recovery records for review without changing user files", async () => {
  const { ctx, options, before } = await fixture();
  await mkdir(paths(ctx).base, { recursive: true });
  const file = join(paths(ctx).base, "pending-operation.json");
  await writeFile(file, '{"version":1,"completed":false,"changes":[{}]}');
  await expect(install(ctx, options)).rejects.toMatchObject({ code: "RECOVERY_INVALID" });
  expect(await readFile(paths(ctx).codex, "utf8")).toBe(before);
  expect(await read(file)).toBeDefined();
});
it("reclaims a completed recovery marker without undoing committed files", async () => {
  const { ctx } = await fixture();
  const recovery = new RecoveryJournal(paths(ctx).base);
  const tx = new Transaction(paths(ctx).base, recovery);
  await tx.change(paths(ctx).codex, "committed configuration");
  const file = join(paths(ctx).base, "pending-operation.json");
  const marker = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
  marker.completed = true;
  await writeFile(file, JSON.stringify(marker));
  await new RecoveryJournal(paths(ctx).base).recover();
  expect(await readFile(paths(ctx).codex, "utf8")).toBe("committed configuration");
  expect(await read(file)).toBeUndefined();
});
it("preserves existing file permissions during an atomic replacement", async () => {
  const { base } = await fixture();
  const file = join(base, "private.txt");
  await writeFile(file, "before", { mode: 0o600 });
  await atomic(file, "after");
  expect(await readFile(file, "utf8")).toBe("after");
  if (process.platform !== "win32") expect((await lstat(file)).mode & 0o777).toBe(0o600);
});
