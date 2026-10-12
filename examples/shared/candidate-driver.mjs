import { createApiExecutor } from "@devcodex/intent-runtime/adapters/api";
import { sampleInput } from "./instances.mjs";

/**
 * Controlled data for this exact demonstration input; never a semantic model.
 * @param {import("@devcodex/intent-runtime").ModelRequest} request
 * @returns {Promise<import("@devcodex/intent-runtime").ModelReply>}
 */
export async function fixtureReply(request) {
  request.signal.throwIfAborted();
  if (JSON.parse(request.payload).currentInput !== sampleInput)
    throw new Error("The explicit fixture mode only accepts the documented demonstration input.");
  const value = request.stage === "core" ? {
    normalizedInput: sampleInput,
    primaryIntent: "Query order 000123",
    requirements: ["Return the result in Chinese."],
    prohibitions: ["Do not modify or cancel the order."],
    intents: [{ action: "query", target: "Order 000123", requirements: ["Include the order status."], blockers: { clarificationReason: null, questions: [], confirmationReason: null, conditionReason: null } }],
  } : {
    data: { orderId: "000123" },
    evidence: [{ path: "/data/orderId", mode: "exact", sources: [{ sourceId: "input", quote: "000123" }] }],
    descriptionChecks: [{ path: "/data/orderId", verdict: "satisfied", explanation: "The exact identifier is supplied.", sources: [{ sourceId: "input", quote: "000123" }] }],
    fieldResults: [{ path: "/data/orderId", status: "extracted", explanation: "Explicit identifier." }],
    issues: [],
  };
  return { outcome: "complete", text: JSON.stringify(value) };
}

/** @returns {import("@devcodex/intent-runtime").ModelExecutor} */
export function createExampleExecutor(fixture = process.argv.includes("--fixture")) {
  if (fixture) return {
    id: "example:controlled-fixture",
    capabilities: { nativeJsonSchema: false, nativeJsonObject: false, isolatedTurn: true, supportsAbort: true },
    generate: fixtureReply,
  };
  const provider = process.env.INTENT_PROVIDER;
  if (provider !== "openai" && provider !== "xai") throw new Error("Set INTENT_PROVIDER to openai or xai, or explicitly select --fixture.");
  const apiKey = provider === "openai" ? process.env.INTENT_OPENAI_KEY : process.env.INTENT_XAI_KEY;
  const model = process.env.INTENT_MODEL;
  if (!apiKey || !model) throw new Error("Set the provider key and explicit INTENT_MODEL locally.");
  return createApiExecutor({ provider, apiKey, model });
}

export async function generateCandidate(executor, task, signal = new AbortController().signal) {
  return executor.generate({ stage: task.stage, instructions: task.instructions, payload: task.payload, format: task.format, signal });
}
