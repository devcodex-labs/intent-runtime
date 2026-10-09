import { access } from "node:fs/promises";
import { join, dirname, resolve, isAbsolute, delimiter } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { InstallContext } from "./environment.js";
import { paths } from "./environment.js";
import { read, InstallError } from "./files.js";
import { servers, upsert, remove, fingerprint, configuration } from "./toml.js";

const execute = promisify(execFile);
export interface ClientAdapter {
  id: string;
  detect(ctx: InstallContext): Promise<boolean>;
  config(ctx: InstallContext): string;
  entries(source: string): Record<string, unknown>;
  write(source: string, name: string, entry: Record<string, unknown>): string;
  remove(source: string, name: string): string;
  fingerprint(source: string, name: string): string;
  instruction(ctx: InstallContext, name: string, body: string): { path: string; content: string };
  overrides?(ctx: InstallContext, name: string): Promise<string[]>;
}
async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}
export const codex: ClientAdapter = {
  id: "codex",
  config: ctx => paths(ctx).codex,
  entries: servers,
  write: upsert,
  remove,
  fingerprint,
  instruction: (ctx, name, body) => ({
    path: join(paths(ctx).skills, name, "SKILL.md"),
    content: "---\nname: " + name + "\ndescription: Structure the explicitly supplied current user request with intent-runtime MCP; use when intent recognition is requested. Do not perform the recognized business operation.\n---\n\n" + body,
  }),
  async overrides(ctx, name) {
    const notices: string[] = [];
    let dir = ctx.cwd;
    while (true) {
      const file = join(dir, ".codex", "config.toml");
      if (file !== paths(ctx).codex) {
        const text = await read(file);
        if (text && Object.hasOwn(servers(text), name)) notices.push("Trusted project configuration may override the user registration: " + file);
      }
      if (await exists(join(dir, ".git")) || dirname(dir) === dir) break;
      dir = dirname(dir);
    }
    const user = configuration(await read(paths(ctx).codex) ?? "");
    if (typeof user.profile === "string" && /^[a-zA-Z0-9_-]+$/.test(user.profile)) {
      const file = join(dirname(paths(ctx).codex), user.profile + ".config.toml");
      const text = await read(file);
      if (text && Object.hasOwn(servers(text), name)) notices.push("Configured profile may override the user registration: " + file);
      const selected = record(user.profiles) ? user.profiles[user.profile] : undefined;
      if (record(selected) && record(selected.mcp_servers) && Object.hasOwn(selected.mcp_servers, name)) notices.push("Configured inline profile may override the user registration: " + user.profile);
    }
    return notices;
  },
  async detect(ctx) {
    if (await exists(dirname(paths(ctx).codex)) || await exists(join(ctx.home, ".codex"))) return true;
    const executables = (ctx.env.PATH ?? "").split(delimiter).filter(Boolean);
    for (const dir of executables) for (const name of ctx.platform === "win32" ? ["codex.cmd", "codex.exe"] : ["codex"]) if (await exists(join(dir, name))) return true;
    if (ctx.platform === "darwin") {
      for (const parent of ["/Applications", join(ctx.home, "Applications")]) for (const name of ["Codex.app", "ChatGPT.app"]) if (await exists(join(parent, name))) return true;
    }
    if (ctx.platform === "win32") {
      const local = ctx.env.LOCALAPPDATA ?? join(ctx.home, "AppData", "Local");
      for (const parts of [["Programs", "Codex", "Codex.exe"], ["Codex", "Codex.exe"], ["Programs", "ChatGPT", "ChatGPT.exe"]]) if (await exists(join(local, ...parts))) return true;
      try {
        const { stdout } = await execute("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "if (Get-AppxPackage | Where-Object { $_.Name -in @('OpenAI.Codex', 'OpenAI.ChatGPT-Desktop') }) { 'intent-client-found' }"], { timeout: 5000, windowsHide: true });
        return stdout.includes("intent-client-found");
      } catch { return false; }
    }
    return false;
  },
};
export function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
export async function belongsToModule(entry: unknown): Promise<boolean> {
  if (!record(entry) || typeof entry.command !== "string" || !Array.isArray(entry.args)) return false;
  const name = entry.command.replaceAll("\\", "/").split("/").pop();
  if (name === "intent-runtime-mcp" || name === "intent-runtime-mcp.cmd" || name === "intent-runtime-mcp.exe") return true;
  const main = entry.args[0];
  if (typeof main !== "string" || !main.replaceAll("\\", "/").endsWith("/dist/transports/mcp/main.js")) return false;
  try { return (JSON.parse(await read(resolve(dirname(main), "../../..", "package.json")) ?? "{}") as { name?: string }).name === "@devcodex-labs/intent-runtime"; }
  catch { return false; }
}
export function configFromEntry(entry: Record<string, unknown>, clientFile: string): string | undefined {
  if (!Array.isArray(entry.args)) return undefined;
  const index = entry.args.indexOf("--config");
  if (index === -1 || typeof entry.args[index + 1] !== "string") return undefined;
  const config = entry.args[index + 1] as string;
  if (isAbsolute(config)) return config;
  if (typeof entry.cwd !== "string" || !isAbsolute(entry.cwd)) throw new InstallError("CONFIG_PATH_AMBIGUOUS", "Existing relative --config needs an absolute cwd: " + clientFile);
  return resolve(entry.cwd, config);
}
export async function independentOriginal(entry: Record<string, unknown>, ctx: InstallContext, clientFile: string): Promise<boolean> {
  if (!await belongsToModule(entry) || typeof entry.command !== "string" || !isAbsolute(entry.command) || !Array.isArray(entry.args) || typeof entry.args[0] !== "string") return false;
  const main = entry.args[0];
  if (!isAbsolute(main) || resolve(main) === resolve(paths(ctx).main)) return false;
  const config = configFromEntry(entry, clientFile);
  return !!config && await exists(entry.command) && await exists(main) && await exists(config);
}
