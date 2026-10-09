import { s } from "schema-dsl/pure";
export const SCHEMA_PRESETS = {
  none: undefined,
  singleOrder: s({
    orderId: s("string!").description(
      "All order identifiers in the current request. A scalar cannot represent multiple orders; report mismatch, never choose arbitrarily.",
    ),
  }),
  project: s({
    projectName: s("string")
      .optional()
      .description(
        "Current project name, only when provided. Examples such as example-service are not facts. Never introduce create/modify actions from the definition.",
      ),
    issueType: s("登录失败|查询失败|其他")
      .optional()
      .description(
        "Current actual issue type; examples and negated problems are not facts.",
      ),
  }),
  orders: {
    type: "object",
    properties: {
      orders: {
        type: "array",
        items: {
          type: "object",
          properties: {
            orderId: { type: "string" },
            operation: { type: "string", enum: ["cancel", "query"] },
          },
          required: ["orderId", "operation"],
          additionalProperties: false,
        },
        description:
          "All current orders and their respective requested operation; preserve associations.",
      },
    },
    required: ["orders"],
  },
  endTime: {
    type: "object",
    description:
      "The selected endTime must be later than the provided startTime. Unselected startTime may be evidence but must not be returned; missing start evidence must be reported.",
    properties: {
      startTime: { type: "string", format: "date-time" },
      endTime: { type: "string", format: "date-time" },
    },
    required: ["startTime", "endTime"],
  },
};
