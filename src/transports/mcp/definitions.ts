import type { IntentMcpToolDefinition } from "./types.js";

const contextSchema = {
  anyOf: [
    { type: "string" },
    {
      type: "array",
      items: {
        type: "object",
        properties: {
          role: { type: "string", enum: ["user", "assistant", "tool"] },
          content: { type: "string" },
        },
        required: ["role", "content"],
        additionalProperties: false,
      },
    },
  ],
};

export const MCP_TOOLS = [
  {
    name: "intent_prepare",
    description:
      "Start intent recognition from the exact current user input, explicit related context and selected fields. Returns a core task; finish this call before generating and submitting a candidate. Do not execute the recognized business operation.",
    inputSchema: {
      type: "object" as const,
      properties: {
        instance: { type: "string" },
        input: { type: "string" },
        fields: { type: "array", items: { type: "string" } },
        context: contextSchema,
      },
      required: ["instance", "input"],
      additionalProperties: false,
    },
  },
  {
    name: "intent_accept",
    description:
      "Submit the complete JSON candidateText for the returned jobId and stepToken. Follow another task until result/error. Tokens must come from the actual previous reply.",
    inputSchema: {
      type: "object" as const,
      properties: {
        jobId: { type: "string" },
        stepToken: { type: "string" },
        candidateText: { type: "string" },
      },
      required: ["jobId", "stepToken", "candidateText"],
      additionalProperties: false,
    },
  },
  {
    name: "intent_cancel",
    description:
      "End a job without submitting a candidate. Use refusal or incomplete when applicable; defaults to cancelled.",
    inputSchema: {
      type: "object" as const,
      properties: {
        jobId: { type: "string" },
        outcome: { type: "string", enum: ["cancelled", "refusal", "incomplete"] },
        detail: { type: "string", maxLength: 2048, description: "Cancellation detail, at most 2048 UTF-8 bytes." },
      },
      required: ["jobId"],
      additionalProperties: false,
    },
  },
] as const;

export const EXECUTOR_TOOL = {
  name: "intent_parse",
  description:
    "Recognize the exact user input using the server's configured model executor. Returns the final structured intent; does not execute the business operation or read implicit chat history.",
  inputSchema: {
    type: "object" as const,
    properties: {
      instance: { type: "string" },
      input: { type: "string" },
      fields: { type: "array", items: { type: "string" } },
      context: contextSchema,
    },
    required: ["instance", "input"],
    additionalProperties: false,
  },
};

export function toolDefinitions(mode: "host" | "executor", prefix: string, instanceNames: readonly string[]): IntentMcpToolDefinition[] {
  // Give each adapter its own metadata; SDK registration never mutates legacy declarations.
  const tools = JSON.parse(JSON.stringify(mode === "host" ? MCP_TOOLS : [EXECUTOR_TOOL])) as IntentMcpToolDefinition[];
  return tools.map(tool => ({ ...tool, name: prefix + tool.name,
    ...(tool.name === "intent_prepare" || tool.name === "intent_parse" ? { inputSchema: {
      ...tool.inputSchema,
      properties: { ...tool.inputSchema.properties, instance: { type: "string", enum: [...instanceNames] } },
    } } : {}),
  }));
}
