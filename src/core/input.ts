import type { IntentParseRequest } from "../contracts/public.js";
import type { Runtime } from "./config.js";
import { fail } from "../errors.js";
import { bytes, freeze, isObject, onlyKeys } from "../internal/object.js";
export interface Source {
  sourceId: string;
  role: "user" | "assistant" | "tool" | "background";
  content: string;
}
export interface ParseTask {
  input: string;
  context: readonly Source[];
  selectedNames: readonly string[];
}
export function prepareTask(
  runtime: Runtime,
  request: IntentParseRequest,
): ParseTask {
  if (runtime.disposed)
    fail("INSTANCE_DISPOSED", "input", "Intent instance is disposed.");
  if (!isObject(request))
    fail("INPUT_INVALID", "input", "Expected one parse request object.");
  onlyKeys(request, ["input", "fields", "context"], "input", "INPUT_INVALID");
  if (typeof request.input !== "string" || !request.input.trim())
    fail("INPUT_INVALID", "input", "input must contain non-whitespace text.");
  if (bytes(request.input) > runtime.limits.maxInputBytes)
    fail("LIMIT_EXCEEDED", "input", "input exceeds maxInputBytes.");
  if (
    request.fields !== undefined &&
    (!Array.isArray(request.fields) ||
      request.fields.some((name) => typeof name !== "string"))
  ) {
    fail("INPUT_INVALID", "input", "fields must be a string array.");
  }
  const context: Source[] = [];
  if (typeof request.context === "string") {
    if (request.context)
      context.push({
        sourceId: "context:0",
        role: "background",
        content: request.context,
      });
  } else if (request.context !== undefined) {
    if (!Array.isArray(request.context))
      fail("INPUT_INVALID", "input", "context must be text or messages.");
    if (request.context.length > runtime.limits.maxContextMessages)
      fail("LIMIT_EXCEEDED", "input", "context exceeds message limit.");
    for (const [index, message] of request.context.entries()) {
      if (!isObject(message))
        fail(
          "INPUT_INVALID",
          "input",
          "Context messages must be plain objects.",
        );
      onlyKeys(message, ["role", "content"], "input", "INPUT_INVALID");
      if (
        !["user", "assistant", "tool"].includes(message.role as string) ||
        typeof message.content !== "string"
      )
        fail("INPUT_INVALID", "input", "Invalid context message.");
      context.push({
        sourceId: "context:" + index,
        role: message.role as Source["role"],
        content: message.content,
      });
    }
  }
  if (bytes(JSON.stringify(context)) > runtime.limits.maxContextBytes)
    fail("LIMIT_EXCEEDED", "input", "context exceeds maxContextBytes.");
  return freeze({
    input: request.input,
    context,
    selectedNames: runtime.store.select(request.fields),
  });
}
