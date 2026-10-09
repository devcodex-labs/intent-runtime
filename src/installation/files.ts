import { mkdir, readFile, writeFile, rename, unlink, stat, lstat, realpath, open } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
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
export async function atomic(path: string, content: string): Promise<void> {
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
  try { await writeFile(temp, content, { flag: "wx", mode }); await rename(temp, path); }
  finally { await unlink(temp).catch(() => {}); }
}
export class Transaction {
  private changes: { path: string; before: string | undefined; after: string | undefined }[] = [];
  readonly backup: string;
  constructor(base: string) { this.backup = join(base, "backups", Date.now() + "-" + randomUUID()); }
  async change(path: string, after: string | undefined): Promise<void> {
    const before = await read(path);
    if (before === after) return;
    await mkdir(this.backup, { recursive: true, mode: 0o700 });
    await writeFile(join(this.backup, this.changes.length + ".json"), JSON.stringify({ path, content: before ?? null }), { flag: "wx", mode: 0o600 });
    if (await read(path) !== before) throw new InstallError("CONFIG_CHANGED", "Configuration changed while preparing the update: " + path);
    if (after === undefined) await unlink(path); else await atomic(path, after);
    this.changes.push({ path, before, after });
  }
  async rollback(): Promise<void> {
    const conflicts: string[] = [];
    for (const { path, before, after } of [...this.changes].reverse()) {
      try {
        if (await read(path) !== after) { conflicts.push(path); continue; }
        if (before === undefined) await unlink(path); else await atomic(path, before);
      } catch { conflicts.push(path); }
    }
    if (conflicts.length) throw new InstallError("ROLLBACK_INCOMPLETE", "Some files changed or could not be restored; backups: " + this.backup);
  }
}
export async function locked<T>(ctx: InstallContext, action: () => Promise<T>): Promise<T> {
  const p = paths(ctx);
  await mkdir(p.base, { recursive: true, mode: 0o700 });
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
  await handle.writeFile(token);
  try { return await action(); }
  finally { await handle.close(); if (await read(p.lock) === token) await unlink(p.lock); }
}
export function diagnostic(error: unknown): { code: string; message: string } {
  if (error instanceof InstallError) return { code: error.code, message: error.message };
  const e = error as NodeJS.ErrnoException;
  return { code: e?.code ?? "INSTALL_FAILED", message: "Installation operation failed" + (e?.path ? ": " + e.path : ". Check files, permissions and runtime dependencies.") };
}
