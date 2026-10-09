import type {
  IntentResult,
  ModelReply,
  ModelRequest,
} from "../contracts/public.js";
import { IntentParseError, asIntentError, fail } from "../errors.js";
import { bytes, freeze } from "../internal/object.js";
import {
  CORE_INSTRUCTIONS,
  CORE_SCHEMA,
  DATA_INSTRUCTIONS,
} from "../prompts/tasks.js";
import { assembleCore } from "../validation/core.js";
import { validateData } from "../validation/data.js";
import { readJson } from "../validation/json-reader.js";
import type { Runtime } from "./config.js";
import type { ParseTask } from "./input.js";
export interface Pipeline {
  runtime: Runtime;
  task: ParseTask;
  stage: "core" | "data";
  repairs: number;
  controller: AbortController;
  coreResult?: IntentResult;
  repair?: { candidate: string; diagnostic: string };
  terminal: boolean;
}
export function startPipeline(runtime: Runtime, task: ParseTask): Pipeline {
  if (runtime.disposed)
    fail("INSTANCE_DISPOSED", "input", "Intent instance is disposed.");
  const controller = new AbortController();
  runtime.active.add(controller);
  return {
    runtime,
    task,
    stage: "core",
    repairs: 0,
    controller,
    terminal: false,
  };
}
export function stopPipeline(state: Pipeline): void {
  state.terminal = true;
  state.runtime.active.delete(state.controller);
}
export function attachPartial(
  state: Pipeline,
  error: IntentParseError,
): IntentParseError {
  if (state.coreResult) error.partialResult = structuredClone(state.coreResult);
  return error;
}
export function nextRequest(state: Pipeline): ModelRequest {
  if (state.terminal)
    fail("BRIDGE_STEP_CONFLICT", "bridge", "Pipeline is already terminal.");
  if (state.runtime.disposed)
    throw attachPartial(
      state,
      new IntentParseError(
        "INSTANCE_DISPOSED",
        state.stage,
        "Intent instance is disposed.",
      ),
    );
  const { task, runtime, stage } = state;
  const payload = JSON.stringify({
    structuredLanguage: runtime.language,
    currentInput: task.input,
    context: task.context,
    schemaReference: runtime.store.schema,
    ...(stage === "data"
      ? {
          checkedDefault: state.coreResult,
          selectedSchema: runtime.store.project(task.selectedNames),
          selectedFields: task.selectedNames,
        }
      : {}),
    ...(state.repair ? { repair: state.repair } : {}),
  });
  const instructions =
    (stage === "core" ? CORE_INSTRUCTIONS : DATA_INSTRUCTIONS) +
    (state.repair
      ? "\nRepair the complete previous candidate using the diagnostic. Do not invent facts to make validation pass."
      : "");
  if (
    bytes(payload) +
      bytes(instructions) +
      bytes(JSON.stringify(stage === "core" ? CORE_SCHEMA : {})) >
    runtime.limits.maxRequestBytes
  ) {
    throw attachPartial(
      state,
      new IntentParseError(
        "LIMIT_EXCEEDED",
        stage,
        "Stage request exceeds maxRequestBytes.",
      ),
    );
  }
  return {
    stage,
    instructions,
    payload,
    format:
      stage === "core"
        ? { kind: "json_schema", name: "intent_core", schema: structuredClone(CORE_SCHEMA) }
        : { kind: "json_object" },
    signal: state.controller.signal,
  };
}
export async function acceptCandidate(
  state: Pipeline,
  reply: ModelReply,
): Promise<IntentResult | undefined> {
  if (state.terminal)
    fail("BRIDGE_STEP_CONFLICT", "bridge", "Pipeline is already terminal.");
  try {
    if (state.runtime.disposed)
      fail("INSTANCE_DISPOSED", state.stage, "Intent instance is disposed.");
    if (state.controller.signal.aborted) throw state.controller.signal.reason;
    if (
      !reply ||
      !["complete", "refusal", "incomplete"].includes(reply.outcome)
    )
      fail("MODEL_OUTPUT_INVALID", state.stage, "Invalid executor reply.");
    if (reply.outcome !== "complete")
      fail(
        reply.outcome === "refusal"
          ? "MODEL_REFUSED"
          : "MODEL_OUTPUT_INCOMPLETE",
        state.stage,
        "Model refused or did not complete the recognition task.",
      );
    const value = readJson(reply.text, state.runtime.limits, state.stage);
    if (state.stage === "core") {
      state.coreResult = freeze(assembleCore(state.runtime, state.task, value));
      delete state.repair;
      state.repairs = 0;
      if (state.task.selectedNames.length) {
        state.stage = "data";
        return undefined;
      }
      stopPipeline(state);
      return structuredClone(state.coreResult);
    }
    const data = await validateData(state.runtime, state.task, value, state.controller.signal);
    if (state.controller.signal.aborted) throw state.controller.signal.reason;
    const result = { ...state.coreResult!, data };
    stopPipeline(state);
    return structuredClone(result);
  } catch (cause) {
    const error = asIntentError(cause, state.stage);
    if (
      error.code === "MODEL_OUTPUT_INVALID" &&
      !state.controller.signal.aborted &&
      state.repairs < state.runtime.repairAttempts &&
      reply?.outcome === "complete" &&
      typeof reply.text === "string"
    ) {
      state.repairs++;
      state.repair = { candidate: reply.text, diagnostic: error.message };
      return undefined;
    }
    stopPipeline(state);
    throw attachPartial(state, error);
  }
}
