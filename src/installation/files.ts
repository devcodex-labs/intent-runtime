import { mkdir, readFile, writeFile, rename, unlink, stat, lstat, realpath, open } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import type { InstallContext } from "./environment.js";
import { paths } from "./environment.js";

export class InstallError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}
export async function read(path: string): Promise<string | undefined> {
  try { return await readFile(path, "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}
export function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }
export async function atomic(path: string, content: string, check?: { expected: string | undefined }): Promise<void> {
  try {
    if ((await lstat(path)).isSymbolicLink()) {
      try { path = await realpath(path); }
      catch { throw new InstallError("CONFIG_SYMLINK_BROKEN", "Configuration symlink target is unavailable: " + path); }
    }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  let mode = 0o600;
  try { mode = (await stat(path)).mode & 0o777; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const temp = path + "." + randomUUID() + ".tmp";
  try {
    await writeFile(temp, content, { flag: "wx", mode });
    if (check && await read(path) !== check.expected) throw new InstallError("CONFIG_CHANGED", "Configuration changed while preparing the update: " + path);
    await rename(temp, path);
  }
  finally { await unlink(temp).catch(() => {}); }
}
interface RecoveryChange { owner: string; path: string; before: string | null; after: string | null; backup: string }
export class RecoveryJournal {
  private changes: RecoveryChange[] = [];
  private readonly file: string;
  constructor(base: string) { this.file = join(base, "pending-operation.json"); }
  private async save(changes: RecoveryChange[], completed = false): Promise<void> {
    await atomic(this.file, JSON.stringify({ version: 1, completed, changes }) + "\n");
  }
  async recover(): Promise<void> {
    const source = await read(this.file);
    if (source === undefined) return;
    let saved: { version: number; completed: boolean; changes: RecoveryChange[] };
    try {
      saved = JSON.parse(source) as typeof saved;
      if (saved.version !== 1 || typeof saved.completed !== "boolean" || !Array.isArray(saved.changes)) throw new Error();
      for (const change of saved.changes) {
        if (!change || typeof change.owner !== "string" || typeof change.path !== "string" || !isAbsolute(change.path) || typeof change.backup !== "string" || !isAbsolute(change.backup) || (change.before !== null && typeof change.before !== "string") || (change.after !== null && typeof change.after !== "string")) throw new Error();
      }
    } catch { throw new InstallError("RECOVERY_INVALID", "Interrupted operation record is invalid; preserve it for review: " + this.file); }
    if (saved.completed) { await unlink(this.file); return; }
    this.changes = saved.changes;
    try { await this.rollback(); }
    catch { throw new InstallError("RECOVERY_CONFLICT", "Interrupted operation could not be fully restored; preserve user changes and inspect: " + this.file); }
  }
  async record(change: RecoveryChange): Promise<void> {
    const next = [...this.changes, change];
    await this.save(next);
    this.changes = next;
  }
  async rollback(owner?: string): Promise<void> {
    const pending: RecoveryChange[] = [];
    for (const change of [...this.changes].reverse()) {
      if (owner !== undefined && change.owner !== owner) { pending.unshift(change); continue; }
      try {
        const current = await read(change.path);
        if (current === (change.before ?? undefined)) continue;
        if (current !== (change.after ?? undefined)) { pending.unshift(change); continue; }
        if (change.before === null) await unlink(change.path); else await atomic(change.path, change.before, { expected: current });
      } catch { pending.unshift(change); }
    }
    this.changes = pending;
    if (pending.length) await this.save(pending);
    else await unlink(this.file).catch(error => { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; });
    const conflicts = pending.filter(change => owner === undefined || change.owner === owner);
    if (conflicts.length) throw new InstallError("ROLLBACK_INCOMPLETE", "Some files changed or could not be restored; backups: " + [...new Set(conflicts.map(change => change.backup))].join(", "));
  }
  async commit(): Promise<void> {
    if (!this.changes.length) return;
    await this.save(this.changes, true);
    // A completed marker is safe to reclaim next time if deletion is blocked.
    await unlink(this.file).catch(() => {});
    this.changes = [];
  }
}
export class Transaction {
  private changes: { path: string; before: string | undefined; after: string | undefined }[] = [];
  readonly backup: string;
  private readonly owner = randomUUID();
  constructor(base: string, private readonly recovery?: RecoveryJournal) { this.backup = join(base, "backups", Date.now() + "-" + randomUUID()); }
  async change(path: string, after: string | undefined, check?: { expected: string | undefined }): Promise<void> {
    const before = await read(path);
    if (check && before !== check.expected) throw new InstallError("CONFIG_CHANGED", "Configuration changed since the update was calculated: " + path);
    if (before === after) return;
    await mkdir(this.backup, { recursive: true, mode: 0o700 });
    await writeFile(join(this.backup, this.changes.length + ".json"), JSON.stringify({ path, content: before ?? null }), { flag: "wx", mode: 0o600 });
    if (await read(path) !== before) throw new InstallError("CONFIG_CHANGED", "Configuration changed while preparing the update: " + path);
    await this.recovery?.record({ owner: this.owner, path, before: before ?? null, after: after ?? null, backup: this.backup });
    if (after === undefined) {
      if (await read(path) !== before) throw new InstallError("CONFIG_CHANGED", "Configuration changed while preparing the update: " + path);
      await unlink(path);
    } else await atomic(path, after, { expected: before });
    this.changes.push({ path, before, after });
  }
  async rollback(): Promise<void> {
    if (this.recovery) { await this.recovery.rollback(this.owner); return; }
    const conflicts: string[] = [];
    for (const { path, before, after } of [...this.changes].reverse()) {
      try {
        const current = await read(path);
        if (current === before) continue;
        if (current !== after) { conflicts.push(path); continue; }
        if (before === undefined) await unlink(path); else await atomic(path, before, { expected: current });
      } catch { conflicts.push(path); }
    }
    if (conflicts.length) throw new InstallError("ROLLBACK_INCOMPLETE", "Some files changed or could not be restored; backups: " + this.backup);
  }
}
export async function locked<T>(ctx: InstallContext, action: () => Promise<T>): Promise<T> {
  const p = paths(ctx);
  await mkdir(p.base, { recursive: true, mode: 0o700 });
  // A kernel-owned resource serializes stale-file reclamation as well as the
  // transaction. Unlike another lock file, it is released on process death.
  // Canonicalize aliases; a busy port fails closed, never select another port.
  const canonical = await realpath(p.base);
  const identityKey = process.platform === "win32" ? canonical.toLowerCase() : canonical;
  const port = 20000 + createHash("sha256").update(identityKey).digest().readUInt32BE(0) % 20000;
  const guard = createServer(socket => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    guard.once("error", error => reject(new InstallError((error as NodeJS.ErrnoException).code === "EADDRINUSE" ? "INSTALL_BUSY" : "LOCK_UNAVAILABLE", "Cannot acquire local maintenance guard; no files were changed.")));
    guard.listen({ host: "127.0.0.1", port, exclusive: true }, resolve);
  });
  try { return await lockedFile(ctx, action); }
  finally { await new Promise<void>(resolve => guard.close(() => resolve())); }
}
async function lockedFile<T>(ctx: InstallContext, action: () => Promise<T>): Promise<T> {
  const p = paths(ctx);
  const token = JSON.stringify({ pid: process.pid, id: randomUUID() });
  let handle;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { handle = await open(p.lock, "wx", 0o600); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const old = await read(p.lock);
      let stale = false;
      try {
        const { pid } = JSON.parse(old ?? "") as { pid: number };
        if (!Number.isInteger(pid) || pid <= 0) throw new Error();
        try { process.kill(pid, 0); } catch (e) { stale = (e as NodeJS.ErrnoException).code === "ESRCH"; }
      } catch { throw new InstallError("LOCK_INVALID", "Invalid installation lock: " + p.lock); }
      if (!stale || attempt) throw new InstallError("INSTALL_BUSY", "Another installation or maintenance operation is running.");
      if (await read(p.lock) === old) await unlink(p.lock);
    }
  }
  if (!handle) throw new InstallError("INSTALL_BUSY", "Could not acquire installation lock.");
  let written = false;
  const identity = await handle.stat();
  try { await handle.writeFile(token); written = true; return await action(); }
  finally {
    await handle.close();
    const current = await stat(p.lock).catch(error => { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; });
    if (current?.ino === identity.ino && current.dev === identity.dev && (!written || await read(p.lock) === token)) await unlink(p.lock);
  }
}
export function diagnostic(error: unknown): { code: string; message: string } {
  if (error instanceof InstallError) return { code: error.code, message: error.message };
  const e = error as NodeJS.ErrnoException;
  return { code: e?.code ?? "INSTALL_FAILED", message: "Installation operation failed" + (e?.path ? ": " + e.path : ". Check files, permissions and runtime dependencies.") };
}
