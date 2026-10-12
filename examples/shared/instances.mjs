import { Intent } from "@devcodex/intent-runtime";

export const sampleInput = "Query order 000123 and include its status. Return the result in Chinese. Do not modify or cancel the order.";
export const orderSchema = {
  type: "object",
  properties: { orderId: { type: "string", description: "The current requested order identifier. Preserve leading zeros exactly." } },
  required: ["orderId"],
  additionalProperties: false,
};

/** @param {import("@devcodex/intent-runtime").ModelExecutor} [executor] */
export function createInstances(executor) {
  return {
    general: new Intent({ language: "en", ...(executor ? { executor } : {}) }),
    orders: new Intent({ language: "en", schema: orderSchema, ...(executor ? { executor } : {}) }),
  };
}
export function disposeInstances(instances) {
  for (const intent of Object.values(instances)) intent.dispose();
}
