import { homedir } from "node:os";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, realpathSync, lstatSync } from "node:fs";

export interface InstallContext {
  home: string;
  root: string;
  node: string;
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  cwd: string;
}
export function context(options: Partial<InstallContext> = {}): InstallContext {
  const env = options.env ?? process.env;
  return {
    home: resolve(env.INTENT_RUNTIME_USER_HOME || homedir()),
    root: resolve(dirname(fileURLToPath(import.meta.url)), "../.."),
    node: process.execPath,
    platform: process.platform,
    env,
    cwd: process.cwd(),
    ...options,
  };
}
export function paths(ctx: InstallContext) {
  const base = join(ctx.home, ".intent-runtime");
  return {
    base,
    state: join(base, "state.json"),
    lock: join(base, "install.lock"),
    config: join(base, "intent.config.mjs"),
    log: join(base, "logs", "installation.jsonl"),
    codex: join(resolve(ctx.env.CODEX_HOME || join(ctx.home, ".codex")), "config.toml"),
    skills: join(ctx.home, ".agents", "skills"),
    main: join(ctx.root, "dist", "transports", "mcp", "main.js"),
  };
}
export function version(ctx: InstallContext): string {
  return (JSON.parse(readFileSync(join(ctx.root, "package.json"), "utf8")) as { version: string }).version;
}
export function supportedNode(value = process.versions.node): boolean {
  const major = Number(value.split(".")[0]);
  return Number.isInteger(major) && major >= 20;
}
export function directGlobal(ctx: InstallContext): boolean {
  if (ctx.env.npm_config_global !== "true" || !ctx.env.npm_config_prefix) return false;
  const target = join(ctx.env.npm_config_prefix, ...(ctx.platform === "win32" ? [] : ["lib"]), "node_modules", "@devcodex", "intent-runtime");
  try {
    if (lstatSync(target).isSymbolicLink()) return false;
    const normalize = (path: string) => ctx.platform === "win32" ? realpathSync(path).toLowerCase() : realpathSync(path);
    return normalize(target) === normalize(ctx.root);
  } catch { return false; }
}
