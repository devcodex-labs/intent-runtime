import type { Intent } from "../../intent.js";
import type { IntentParseOptions, IntentParseRequest, IntentResult } from "../../contracts/public.js";
import type { AcceptRequest, BridgeReply, BridgeSession, CancelRequest, PrepareRequest } from "../../bridge/index.js";
import type { SerializedIntentError } from "../../errors.js";
import { IntentParseError, fail } from "../../errors.js";
import { isObject, onlyKeys } from "../../internal/object.js";
import { readSignalOptions } from "../../internal/signal.js";
import type { IntentMcpToolResult } from "./types.js";

export function toolResult(value: IntentResult | BridgeReply | SerializedIntentError, isError: boolean, structuredErrors = false): IntentMcpToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    ...(!isError || structuredErrors ? { structuredContent: { ...value } } : {}),
    isError,
  };
}

export async function dispatchHost(session: BridgeSession, name: string, args: unknown, options?: IntentParseOptions): Promise<BridgeReply> {
  if (!isObject(args)) return {
    kind: "error", error: new IntentParseError("INPUT_INVALID", "bridge", "Expected tool arguments.").toJSON(),
  };
  if (name === "intent_accept") return session.accept(args as unknown as AcceptRequest, options);
  const signal = readSignalOptions(options, "bridge");
  if (signal?.aborted) return {
    kind: "error", error: new IntentParseError("MODEL_ABORTED", "bridge", "Tool request cancelled.").toJSON(),
  };
  if (name === "intent_prepare") return session.prepare(args as unknown as PrepareRequest);
  if (name === "intent_cancel") return session.cancel(args as unknown as CancelRequest);
  return { kind: "error", error: new IntentParseError("INPUT_INVALID", "bridge", "Unknown intent tool.").toJSON() };
}

export function parseToolRequest(instances: Record<string, Intent>, args: unknown): { intent: Intent; request: IntentParseRequest } {
  if (!isObject(args)) fail("INPUT_INVALID", "input", "Expected tool arguments.");
  onlyKeys(args, ["instance", "input", "fields", "context"], "input", "INPUT_INVALID");
  if (typeof args.instance !== "string" || !Object.hasOwn(instances, args.instance))
    fail("INPUT_INVALID", "input", "Unknown instance.");
  return {
    intent: instances[args.instance]!,
    request: {
      input: args.input as string,
      ...(args.fields !== undefined ? { fields: args.fields as NonNullable<IntentParseRequest["fields"]> } : {}),
      ...(args.context !== undefined ? { context: args.context as NonNullable<IntentParseRequest["context"]> } : {}),
    },
  };
}
