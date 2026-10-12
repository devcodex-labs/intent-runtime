import type { ErrorStage } from "../errors.js";
import { fail } from "../errors.js";
import { isObject, onlyKeys } from "./object.js";

/** Native call options stay outside JSON requests and model payloads. */
export function readSignalOptions(value: unknown, stage: ErrorStage): AbortSignal | undefined {
  if (value === undefined) return undefined;
  if (!isObject(value)) fail("INPUT_INVALID", stage, "Call options must be a plain object.");
  onlyKeys(value, ["signal"], stage, "INPUT_INVALID");
  const signal = value.signal;
  if (signal === undefined) return undefined;
  try {
    // Use the native brand check, including signals supplied by another realm.
    Object.getOwnPropertyDescriptor(AbortSignal.prototype, "aborted")!.get!.call(signal);
  } catch {
    fail("INPUT_INVALID", stage, "signal must be a native AbortSignal.");
  }
  return signal as AbortSignal;
}
