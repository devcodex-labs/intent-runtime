import { fail } from "../errors.js";
import type { ErrorStage } from "../errors.js";
export function isObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
export function onlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  stage: ErrorStage,
  code: "INPUT_INVALID" | "CONFIG_INVALID" | "MODEL_OUTPUT_INVALID",
): void {
  if (
    Reflect.ownKeys(value).some(
      (key) => typeof key !== "string" || !keys.includes(key),
    )
  )
    fail(code, stage, "Unknown object property.");
  if (
    Object.values(Object.getOwnPropertyDescriptors(value)).some(
      (d) => !("value" in d),
    )
  )
    fail(code, stage, "Accessors are not supported.");
}
export const bytes = (value: string): number =>
  Buffer.byteLength(value, "utf8");
export function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}
export const pointerKey = (key: string): string =>
  key.replace(/~/g, "~0").replace(/\//g, "~1");
export function resolvePointer(
  root: unknown,
  path: string,
): { found: boolean; value: unknown } {
  if (path === "") return { found: true, value: root };
  if (!path.startsWith("/") || /~(?![01])/u.test(path))
    return { found: false, value: undefined };
  let value: unknown = root;
  for (const raw of path.slice(1).split("/")) {
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (
      value === null ||
      typeof value !== "object" ||
      !Object.hasOwn(value, key)
    )
      return { found: false, value: undefined };
    value = (value as Record<string, unknown>)[key];
  }
  return { found: true, value };
}
