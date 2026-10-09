import type { InstallContext } from "./environment.js";
import { paths } from "./environment.js";
import { read, InstallError } from "./files.js";
import { isAbsolute } from "node:path";

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
  configEstablished?: boolean;
  instances: string[];
  registrations: Registration[];
  skills: ManagedSkill[];
  checks: Check[];
  warnings: string[];
}
export async function state(ctx: InstallContext, snapshot?: { text: string | undefined }): Promise<InstallationState | undefined> {
  const text = snapshot ? snapshot.text : await read(paths(ctx).state);
  if (text === undefined) return undefined;
  try {
    const value = JSON.parse(text) as InstallationState;
    if (!value || value.schemaVersion !== 1 || !["configured", "waiting_for_client", "failed", "cleaned"].includes(value.status) || typeof value.version !== "string" || typeof value.node !== "string" || !isAbsolute(value.node) || typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt)) || !Array.isArray(value.registrations) || !Array.isArray(value.skills) || !Array.isArray(value.instances) || !Array.isArray(value.warnings) || !Array.isArray(value.checks) || typeof value.configFile !== "string" || !isAbsolute(value.configFile)) throw new Error();
    for (const r of value.registrations) if (!r || typeof r.client !== "string" || typeof r.path !== "string" || !isAbsolute(r.path) || typeof r.name !== "string" || typeof r.fingerprint !== "string" || !r.entry || typeof r.entry !== "object" || Array.isArray(r.entry) || (r.original !== undefined && (!r.original || typeof r.original !== "object" || Array.isArray(r.original)))) throw new Error();
    for (const s of value.skills) if (!s || typeof s.path !== "string" || !isAbsolute(s.path) || typeof s.name !== "string" || typeof s.hash !== "string") throw new Error();
    if (value.instances.some(i => typeof i !== "string") || value.warnings.some(w => typeof w !== "string")) throw new Error();
    for (const check of value.checks) if (!check || typeof check.name !== "string" || typeof check.ok !== "boolean" || typeof check.detail !== "string") throw new Error();
    if (value.configEstablished !== undefined && typeof value.configEstablished !== "boolean") throw new Error();
    return value;
  } catch { throw new InstallError("STATE_INVALID", "Installation state is invalid; preserve it for review: " + paths(ctx).state); }
}
