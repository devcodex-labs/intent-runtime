import type {
  IntentConfig,
  IntentLimits,
  ModelExecutor,
} from "../contracts/public.js";
import { DEFAULT_LIMITS } from "../contracts/public.js";
import { fail } from "../errors.js";
import { isObject, onlyKeys } from "../internal/object.js";
import { normalizeLanguage } from "../language/tag.js";
import { SchemaStore, snapshotSchema } from "../schema/schema.js";
export interface Runtime {
  language: string;
  store: SchemaStore;
  executor: ModelExecutor | undefined;
  limits: IntentLimits;
  timeoutMs: number;
  repairAttempts: number;
  disposed: boolean;
  active: Set<AbortController>;
  parses: number;
}
const runtimes = new WeakMap<object, Runtime>();
export function registerRuntime(owner: object, runtime: Runtime): void {
  runtimes.set(owner, runtime);
}
export function getRuntime(owner: object): Runtime {
  const runtime = runtimes.get(owner);
  if (!runtime)
    fail("CONFIG_INVALID", "config", "Expected an Intent instance.");
  if (runtime.disposed)
    fail("INSTANCE_DISPOSED", "input", "Intent instance is disposed.");
  return runtime;
}
export function prepareConfig(value: IntentConfig): Runtime {
  const input = value as unknown as Record<string, unknown>;
  if (!isObject(input))
    fail("CONFIG_INVALID", "config", "Configuration must be a plain object.");
  onlyKeys(
    input,
    ["language", "schema", "executor", "timeoutMs", "repairAttempts", "limits"],
    "config",
    "CONFIG_INVALID",
  );
  const limits = { ...DEFAULT_LIMITS };
  if (input.limits !== undefined) {
    if (!isObject(input.limits))
      fail("CONFIG_INVALID", "config", "limits must be a plain object.");
    onlyKeys(input.limits, Object.keys(limits), "config", "CONFIG_INVALID");
    for (const [key, value] of Object.entries(input.limits)) {
      if (value === undefined) continue;
      if (!Number.isSafeInteger(value) || (value as number) <= 0)
        fail(
          "CONFIG_INVALID",
          "config",
          "Limits must be positive safe integers.",
        );
      limits[key as keyof IntentLimits] = value as number;
    }
  }
  const timeoutMs =
    input.timeoutMs === undefined ? 0 : (input.timeoutMs as number);
  if (limits.maxValidationMs > 2147483647)
    fail("CONFIG_INVALID", "config", "maxValidationMs exceeds the timer range.");
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 0 ||
    timeoutMs > 2147483647
  )
    fail("CONFIG_INVALID", "config", "Invalid timeoutMs.");
  const repairAttempts =
    input.repairAttempts === undefined ? 1 : (input.repairAttempts as number);
  if (repairAttempts !== 0 && repairAttempts !== 1)
    fail("CONFIG_INVALID", "config", "repairAttempts must be 0 or 1.");
  const executor = input.executor as ModelExecutor | undefined;
  if (
    executor !== undefined &&
    (!executor ||
      typeof executor.generate !== "function" ||
      typeof executor.id !== "string" ||
      !executor.capabilities ||
      Object.values(executor.capabilities).some(
        (value) => typeof value !== "boolean",
      ) ||
      [
        "nativeJsonSchema",
        "nativeJsonObject",
        "isolatedTurn",
        "supportsAbort",
      ].some(
        (key) =>
          typeof (executor.capabilities as unknown as Record<string, unknown>)[
            key
          ] !== "boolean",
      ))
  ) {
    fail("CONFIG_INVALID", "config", "Invalid model executor.");
  }
  if (executor && !executor.capabilities.supportsAbort)
    fail(
      "HOST_CAPABILITY_UNSUPPORTED",
      "config",
      "Executor must support abort.",
    );
  return {
    language: normalizeLanguage(input.language),
    store: new SchemaStore(
      snapshotSchema(input.schema, limits),
      limits.maxSchemaCacheEntries,
      limits.maxValidationMs,
      limits.maxValidationQueueEntries,
    ),
    executor,
    limits: Object.freeze(limits),
    timeoutMs,
    repairAttempts,
    disposed: false,
    active: new Set(),
    parses: 0,
  };
}
