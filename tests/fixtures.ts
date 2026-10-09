import { vi } from "vitest";
import type { ModelExecutor, ModelReply, ModelRequest } from "../src/index.js";
export function core(target = "Order 000123") {
  return {
    normalizedInput: "Query order 000123.",
    primaryIntent: "Query order 000123.",
    requirements: [],
    prohibitions: [],
    intents: [
      {
        action: "query",
        target,
        requirements: [],
        blockers: {
          clarificationReason: null,
          questions: [],
          confirmationReason: null,
          conditionReason: null,
        },
      },
    ],
  };
}
export function data(value = "000123") {
  return {
    data: { orderId: value },
    evidence: [
      {
        path: "/data/orderId",
        mode: "exact",
        sources: [{ sourceId: "input", quote: value }],
      },
    ],
    descriptionChecks: [
      {
        path: "/data/orderId",
        verdict: "satisfied",
        explanation: "Explicit identifier.",
        sources: [{ sourceId: "input", quote: value }],
      },
    ],
    fieldResults: [
      {
        path: "/data/orderId",
        status: "extracted",
        explanation: "Explicit identifier.",
      },
    ],
    issues: [],
  };
}
export function fakeExecutor(
  ...candidates: unknown[]
): ModelExecutor & {
  generate: ReturnType<
    typeof vi.fn<(request: ModelRequest) => Promise<ModelReply>>
  >;
} {
  let index = 0;
  return {
    id: "test:fixture",
    capabilities: {
      nativeJsonSchema: false,
      nativeJsonObject: false,
      isolatedTurn: true,
      supportsAbort: true,
    },
    generate: vi.fn<(request: ModelRequest) => Promise<ModelReply>>(async () => {
      const value = candidates[index++];
      if (value instanceof Error) throw value;
      return {
        outcome: "complete",
        text: typeof value === "string" ? value : JSON.stringify(value),
      };
    }),
  };
}
export const orderSchema = {
  type: "object",
  properties: {
    orderId: {
      type: "string",
      description: "Current order identifier; preserve exactly.",
    },
  },
  required: ["orderId"],
};
