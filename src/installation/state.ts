import type { InstallContext } from "./environment.js";
import { paths } from "./environment.js";
import { read, InstallError } from "./files.js";

export interface Registration {
  client: string;
  path: string;
  name: string;
  entry: Record<string, unknown>;
  fingerprint: string;
  original?: Record<string, unknown>;
}
export interface ManagedSkill { path: string; name: string; hash: string }
export interface Check { name: string; ok: boolean; detail: string }
export interface InstallationState {
  schemaVersion: 1;
  status: "configured" | "waiting_for_client" | "failed" | "cleaned";
  version: string;
  node: string;
  updatedAt: string;
  configFile: string;
  instances: string[];
  registrations: Registration[];
  skills: ManagedSkill[];
  checks: Check[];
  warnings: string[];
}
export async function state(ctx: InstallContext): Promise<InstallationState | undefined> {
  const text = await read(paths(ctx).state);
  if (text === undefined) return undefined;
  try {
    const value = JSON.parse(text) as InstallationState;
    if (value.schemaVersion !== 1 || !Array.isArray(value.registrations) || !Array.isArray(value.skills) || !Array.isArray(value.instances) || !Array.isArray(value.warnings) || !Array.isArray(value.checks) || typeof value.configFile !== "string") throw new Error();
    for (const r of value.registrations) if (typeof r.client !== "string" || typeof r.path !== "string" || typeof r.name !== "string" || typeof r.fingerprint !== "string" || !r.entry || typeof r.entry !== "object") throw new Error();
    for (const s of value.skills) if (typeof s.path !== "string" || typeof s.name !== "string" || typeof s.hash !== "string") throw new Error();
    return value;
  } catch { throw new InstallError("STATE_INVALID", "Installation state is invalid; preserve it for review: " + paths(ctx).state); }
}
