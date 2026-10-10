import { appendFile, mkdir, lstat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { createRequire } from "node:module";
import { context, paths, version, supportedNode, type InstallContext } from "./environment.js";
import { codex, record, belongsToModule, configFromEntry, independentOriginal, type ClientAdapter } from "./codex.js";
import { locked, Transaction, RecoveryJournal, read, atomic, digest, diagnostic, InstallError } from "./files.js";
import { state, type InstallationState, type Registration, type Check } from "./state.js";
import type { ProbeResult } from "../transports/mcp/probe.js";

export interface InstallOptions {
  adapters?: ClientAdapter[];
  probe?: (entry: Record<string, unknown>, ctx: InstallContext) => Promise<ProbeResult>;
}
export interface MaintenanceResult { status: string; checks: Check[]; warnings: string[]; statePath: string }
const DEFAULT_CONFIG = "export default { instances: { default: {} } };\n";
const adapters = (options: InstallOptions) => options.adapters ?? [codex];
async function linked(path: string): Promise<boolean> {
  try { return (await lstat(path)).isSymbolicLink(); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
}
async function probe(entry: Record<string, unknown>, ctx: InstallContext, options: InstallOptions): Promise<ProbeResult> {
  if (options.probe) return options.probe(entry, ctx);
  if (typeof entry.command !== "string" || !Array.isArray(entry.args) || entry.args.some(a => typeof a !== "string") || typeof entry.cwd !== "string") throw new InstallError("MCP_ENTRY_INVALID", "Invalid MCP command, arguments or working directory.");
  const env: Record<string, string> = {};
  if (record(entry.env)) for (const [key, value] of Object.entries(entry.env)) if (typeof value === "string") env[key] = value;
  if (Array.isArray(entry.env_vars)) for (const value of entry.env_vars) {
    const key = typeof value === "string" ? value : record(value) && value.source !== "remote" && typeof value.name === "string" ? value.name : undefined;
    if (key && ctx.env[key] !== undefined) env[key] = ctx.env[key]!;
  }
  const startupSeconds = entry.startup_timeout_sec ?? 15;
  if (typeof startupSeconds !== "number" || !Number.isFinite(startupSeconds) || startupSeconds <= 0 || startupSeconds * 1000 > 2147483647)
    throw new InstallError("MCP_ENTRY_INVALID", "Invalid MCP startup wait.");
  try {
    const { probeMcp } = await import("../transports/mcp/probe.js");
    return await probeMcp(entry.command, entry.args as string[], entry.cwd, env, Math.ceil(startupSeconds * 1000));
  } catch { throw new InstallError("MCP_PROBE_FAILED", "MCP handshake/task check failed. Check the Node executable, trusted config and runtime dependencies."); }
}
async function log(ctx: InstallContext, event: Record<string, unknown>) {
  const path = paths(ctx).log;
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await appendFile(path, JSON.stringify({ at: new Date().toISOString(), ...event }) + "\n", { mode: 0o600 });
}
function initial(ctx: InstallContext, previous?: InstallationState): InstallationState {
  return {
    schemaVersion: 1, status: "waiting_for_client", version: version(ctx), node: ctx.node, updatedAt: new Date().toISOString(),
    configFile: previous?.configFile ?? paths(ctx).config, instances: previous?.instances ?? [],
    configEstablished: previous?.configEstablished ?? !!previous,
    registrations: previous?.registrations ?? [], skills: previous?.skills ?? [], checks: [], warnings: [],
  };
}
async function choose(adapter: ClientAdapter, source: string, previous: InstallationState | undefined, ctx: InstallContext, clientFile: string) {
  const values = adapter.entries(source);
  const protectedNames = new Set<string>();
  for (const old of previous?.registrations ?? []) {
    if (old.client !== adapter.id || old.path !== clientFile || !Object.hasOwn(values, old.name)) continue;
    if (adapter.fingerprint(source, old.name) === old.fingerprint && isDeepStrictEqual(values[old.name], old.entry)) return { name: old.name, old, entry: old.entry };
    protectedNames.add(old.name);
  }
  for (const name of ["intent-runtime", ...Object.keys(values).filter(n => n !== "intent-runtime")]) {
    if (!protectedNames.has(name) && record(values[name]) && values[name].experimental_environment !== "remote" && await belongsToModule(values[name], ctx)) return { name, entry: values[name] as Record<string, unknown> };
  }
  let name = "intent-runtime", index = 2;
  while (Object.hasOwn(values, name)) name = "intent-runtime-" + index++;
  return { name, entry: undefined };
}
export async function install(ctx = context(), options: InstallOptions = {}): Promise<InstallationState> {
  if (!supportedNode()) throw new InstallError("NODE_UNSUPPORTED", "Node.js >=20.0.0 is required.");
  return locked(ctx, async () => {
    const recovery = new RecoveryJournal(paths(ctx).base);
    await recovery.recover();
    const stateBefore = await read(paths(ctx).state);
    const previous = await state(ctx, { text: stateBefore });
    const next = initial(ctx, previous);
    const configEstablishedBefore = next.configEstablished || await read(next.configFile) !== undefined;
    next.configEstablished = configEstablishedBefore;
    const tx = new Transaction(paths(ctx).base, recovery);
    const failures: { code: string; message: string }[] = [];
    let committed = false;
    try {
      if (await read(paths(ctx).main) === undefined) throw new InstallError("BUILD_MISSING", "Packaged MCP entry is missing: " + paths(ctx).main);
      const detected: ClientAdapter[] = [];
      for (const adapter of adapters(options)) if (await adapter.detect(ctx)) detected.push(adapter);
      if (!detected.length) {
        next.warnings.push("No supported client detected. Install a supported client and reinstall this module or run doctor --repair.");
        await tx.change(paths(ctx).state, JSON.stringify(next, null, 2) + "\n", { expected: stateBefore });
        await log(ctx, { status: next.status });
        await recovery.commit();
        return next;
      }
      const workflow = await read(join(ctx.root, "integrations", "codex", "workflow.md"));
      if (!workflow) throw new InstallError("WORKFLOW_MISSING", "Packaged intent workflow is missing.");
      for (const adapter of detected) {
        const clientTx = new Transaction(paths(ctx).base, recovery);
        const beforeClient = structuredClone(next);
        try {
          const clientFile = adapter.config(ctx);
          const clientBefore = await read(clientFile);
          const source = clientBefore ?? "";
          const selected = await choose(adapter, source, previous, ctx, clientFile);
          let configFile = selected.entry ? configFromEntry(selected.entry, clientFile) : undefined;
          configFile ??= next.configFile;
          if (await read(configFile) === undefined) {
            if (configFile !== paths(ctx).config || (previous?.configFile === configFile && previous.configEstablished !== false)) throw new InstallError("TRUSTED_CONFIG_MISSING", "Existing trusted instance config is missing: " + configFile);
            await clientTx.change(configFile, DEFAULT_CONFIG, { expected: undefined });
          }
          next.configFile = configFile;
          const fields: Record<string, unknown> = { command: ctx.node, args: [paths(ctx).main, "--config", configFile], cwd: selected.entry?.cwd ?? dirname(configFile), enabled: true };
          if (selected.entry?.startup_timeout_sec === undefined) fields.startup_timeout_sec = 15;
          const updated = adapter.write(source, selected.name, fields);
          const entry = adapter.entries(updated)[selected.name];
          if (!record(entry)) throw new InstallError("MCP_ENTRY_INVALID", "Generated MCP entry is invalid.");
          await clientTx.change(clientFile, updated, { expected: clientBefore });
          const checked = await probe(entry, ctx, options);
          next.instances = checked.instances;
          next.configEstablished = true;
          next.checks.push({ name: adapter.id + ".protocol", ok: true, detail: "initialize, tools/list, prepare and cancel completed; instances: " + checked.instances.join(", ") });
          const registration: Registration = { client: adapter.id, path: clientFile, name: selected.name, entry, fingerprint: adapter.fingerprint(updated, selected.name) };
          if (selected.old?.original) registration.original = selected.old.original;
          else if (selected.entry && !selected.old) registration.original = selected.entry;
          next.registrations = next.registrations.filter(r => !(r.client === adapter.id && r.path === clientFile && r.name === selected.name));
          next.registrations.push(registration);
          let skillName = "intent-runtime", suffix = 2;
          const body = "MCP server: " + JSON.stringify(selected.name) + ". Configured instances: " + JSON.stringify(checked.instances) + ".\nUse default when available; use the sole instance when only one is configured; otherwise ask which business instance applies.\n\n" + workflow;
          while (true) {
            const instruction = adapter.instruction(ctx, skillName, body);
            const oldContent = await read(instruction.path);
            const managed = previous?.skills.find(s => s.path === instruction.path);
            const symlink = await linked(instruction.path);
            if (managed && (symlink || (oldContent !== undefined && digest(oldContent) !== managed.hash))) {
              next.warnings.push("User-edited instruction preserved: " + instruction.path);
              break;
            }
            if ((oldContent !== undefined || symlink) && !managed) { skillName = "intent-runtime-" + suffix++; continue; }
            await clientTx.change(instruction.path, instruction.content, { expected: oldContent });
            next.skills = next.skills.filter(s => s.path !== instruction.path);
            next.skills.push({ path: instruction.path, name: skillName, hash: digest(instruction.content) });
            break;
          }
        } catch (error) {
          await clientTx.rollback();
          Object.assign(next, beforeClient);
          const failure = diagnostic(error);
          failures.push(failure);
          next.checks.push({ name: adapter.id + ".configuration", ok: false, detail: failure.message });
          next.warnings.push(adapter.id + ": " + failure.code + ": " + failure.message);
        }
      }
      next.status = failures.length ? "failed" : "configured";
      await tx.change(paths(ctx).state, JSON.stringify(next, null, 2) + "\n", { expected: stateBefore });
      await log(ctx, { status: next.status, version: next.version, clients: detected.map(a => a.id), warnings: next.warnings });
      await recovery.commit();
      committed = true;
      if (failures.length) throw new InstallError(failures[0]!.code, failures[0]!.message);
      return next;
    } catch (error) {
      let failure = error;
      if (!committed) {
        let restored = true;
        try { await recovery.rollback(); } catch (restoreError) { failure = restoreError; restored = false; }
        if (restored) {
          const failed = initial(ctx, previous);
          failed.configEstablished = configEstablishedBefore;
          failed.status = "failed";
          failed.checks.push({ name: "initialization", ok: false, detail: diagnostic(failure).message });
          await atomic(paths(ctx).state, JSON.stringify(failed, null, 2) + "\n", { expected: stateBefore }).catch(() => {});
        }
      }
      await log(ctx, { status: "failed", ...diagnostic(failure), backup: tx.backup }).catch(() => {});
      throw failure;
    }
  });
}
export async function repair(ctx = context(), options: InstallOptions = {}): Promise<MaintenanceResult> {
  // Reuse successful probes only within this repair, while the registration
  // and the trusted config text remain unchanged. There is no persistent cache.
  const verified: { entry: Record<string, unknown>; config: string; text: string | undefined; result: ProbeResult }[] = [];
  const checking: InstallOptions = { ...options, probe: async entry => {
    const config = configFromEntry(entry, paths(ctx).codex);
    if (!config) return probe(entry, ctx, options);
    const text = await read(config);
    const cached = verified.find(item => item.config === config && item.text === text && isDeepStrictEqual(item.entry, entry));
    if (cached) return cached.result;
    const snapshot = structuredClone(entry);
    const result = await probe(entry, ctx, options);
    if (text === await read(config)) verified.push({ entry: snapshot, config, text, result });
    return result;
  } };
  await install(ctx, checking);
  return doctor(ctx, checking);
}
export async function doctor(ctx = context(), options: InstallOptions = {}): Promise<MaintenanceResult> {
  const result: MaintenanceResult = { status: "healthy", checks: [], warnings: [], statePath: paths(ctx).state };
  result.checks.push({ name: "node", ok: supportedNode(), detail: process.version + "; required >=20.0.0" });
  result.checks.push({ name: "package", ok: await read(paths(ctx).main) !== undefined, detail: version(ctx) + "; " + ctx.root });
  const require = createRequire(join(ctx.root, "package.json"));
  for (const dependency of ["@modelcontextprotocol/sdk/client/index.js", "schema-dsl/pure", "toml-eslint-parser"]) {
    try { result.checks.push({ name: "dependency", ok: true, detail: require.resolve(dependency) }); }
    catch { result.checks.push({ name: "dependency", ok: false, detail: "Runtime dependency missing: " + dependency }); }
  }
  const pending = await read(join(paths(ctx).base, "pending-operation.json"));
  if (pending !== undefined) {
    try {
      if ((JSON.parse(pending) as { completed?: boolean }).completed === true) result.warnings.push("Completed maintenance record remains; doctor --repair can reclaim it.");
      else result.checks.push({ name: "recovery", ok: false, detail: "Interrupted maintenance requires recovery; run doctor --repair." });
    } catch { result.checks.push({ name: "recovery", ok: false, detail: "Invalid interrupted maintenance record; preserve it for review." }); }
  }
  let previous: InstallationState | undefined;
  try { previous = await state(ctx); } catch (error) { const e = diagnostic(error); result.checks.push({ name: "state", ok: false, detail: e.message }); }
  if (previous?.status === "failed") result.checks.push(...previous.checks.filter(c => !c.ok));
  if (!previous || !previous.registrations.length) result.checks.push({ name: "registration", ok: false, detail: "No managed MCP registration; run doctor --repair after installing a supported client." });
  for (const r of previous?.registrations ?? []) {
    const adapter = adapters(options).find(a => a.id === r.client);
    if (!adapter) { result.checks.push({ name: r.client, ok: false, detail: "Client adapter unavailable." }); continue; }
    try {
      const source = await read(r.path) ?? "";
      const entry = adapter.entries(source)[r.name];
      if (!record(entry)) throw new InstallError("REGISTRATION_MISSING", "MCP registration absent: " + r.path);
      if (!isDeepStrictEqual(entry, r.entry) || adapter.fingerprint(source, r.name) !== r.fingerprint) result.warnings.push("Managed MCP registration has user changes: " + r.path + " / " + r.name);
      if (entry.enabled === false) throw new InstallError("REGISTRATION_DISABLED", "MCP registration is disabled: " + r.name);
      const checked = await probe(entry, ctx, options);
      result.checks.push({ name: r.client + ".protocol", ok: true, detail: "Actual stdio check completed; instances: " + checked.instances.join(", ") });
      try { result.warnings.push(...(await adapter.overrides?.(ctx, r.name) ?? [])); }
      catch { result.warnings.push("Some higher-priority client configuration could not be inspected."); }
    } catch (error) { result.checks.push({ name: r.client + ".protocol", ok: false, detail: diagnostic(error).message }); }
  }
  for (const skill of previous?.skills ?? []) {
    const content = await read(skill.path);
    result.checks.push({ name: "instruction", ok: content !== undefined, detail: skill.path });
    if (await linked(skill.path) || (content !== undefined && digest(content) !== skill.hash)) result.warnings.push("User-edited instruction preserved: " + skill.path);
  }
  result.warnings.push(...(previous?.warnings ?? []));
  if (result.checks.some(c => !c.ok)) result.status = "unhealthy";
  return result;
}
export async function clean(ctx = context(), options: InstallOptions = {}): Promise<MaintenanceResult> {
  return locked(ctx, async () => {
    const recovery = new RecoveryJournal(paths(ctx).base);
    await recovery.recover();
    const stateBefore = await read(paths(ctx).state);
    const previous = await state(ctx, { text: stateBefore });
    const result: MaintenanceResult = { status: "cleaned", checks: [], warnings: [], statePath: paths(ctx).state };
    if (!previous) return result;
    const next = initial(ctx, previous);
    const tx = new Transaction(paths(ctx).base, recovery);
    try {
      for (const r of previous.registrations) {
        const adapter = adapters(options).find(a => a.id === r.client);
        if (!adapter) { result.warnings.push("Unknown client registration preserved: " + r.path); continue; }
        const clientBefore = await read(r.path);
        const source = clientBefore ?? "";
        const current = adapter.entries(source)[r.name];
        if (current === undefined) { next.registrations = next.registrations.filter(v => v !== r); continue; }
        if (!isDeepStrictEqual(current, r.entry) || adapter.fingerprint(source, r.name) !== r.fingerprint) { result.warnings.push("User-edited registration preserved: " + r.path + " / " + r.name); continue; }
        let updated = adapter.remove(source, r.name);
        if (r.original) {
          if (await independentOriginal(r.original, ctx, r.path)) updated = adapter.write(updated, r.name, r.original);
          else result.checks.push({ name: "original", ok: true, detail: "Original registration not restored: its independent executable/config is unavailable or depends on this global package." });
        }
        await tx.change(r.path, updated, { expected: clientBefore });
        next.registrations = next.registrations.filter(v => v !== r);
        result.checks.push({ name: "registration", ok: true, detail: r.path + " / " + r.name });
      }
      for (const skill of previous.skills) {
        if (await linked(skill.path)) { result.warnings.push("User-edited instruction preserved: " + skill.path); continue; }
        const content = await read(skill.path);
        if (content !== undefined && digest(content) !== skill.hash) { result.warnings.push("User-edited instruction preserved: " + skill.path); continue; }
        if (content !== undefined) await tx.change(skill.path, undefined, { expected: content });
        next.skills = next.skills.filter(s => s !== skill);
        result.checks.push({ name: "instruction", ok: true, detail: skill.path });
      }
      next.status = "cleaned";
      next.warnings = result.warnings;
      await tx.change(paths(ctx).state, JSON.stringify(next, null, 2) + "\n", { expected: stateBefore });
      await log(ctx, { status: "cleaned", warnings: result.warnings });
      await recovery.commit();
      if (result.warnings.length) result.status = "partial";
      return result;
    } catch (error) { await recovery.rollback(); throw error; }
  });
}
