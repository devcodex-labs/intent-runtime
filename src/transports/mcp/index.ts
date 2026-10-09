import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { createIntentBridge } from "../../bridge/index.js";
import type {
  AcceptRequest,
  BridgeConfig,
  CancelRequest,
  PrepareRequest,
} from "../../bridge/index.js";
import { isObject } from "../../internal/object.js";
import { IntentParseError } from "../../errors.js";
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
        outcome: {
          type: "string",
          enum: ["cancelled", "refusal", "incomplete"],
        },
        detail: { type: "string", maxLength: 2048 },
      },
      required: ["jobId"],
      additionalProperties: false,
    },
  },
] as const;
export async function serveIntentMcp(
  config: BridgeConfig & { transport?: Transport },
): Promise<{ close(): Promise<void> }> {
  const { transport, ...bridgeConfig } = config;
  const bridge = createIntentBridge(bridgeConfig);
  const connection = bridge.connect();
  const server = new Server(
    { name: "intent-runtime", version: "1.0.0-dev.0" },
    {
      capabilities: { tools: {} },
      instructions:
        "For intent recognition, call intent_prepare with the exact supplied input and related explicit context. After the tool ends, generate only its requested candidate and call intent_accept. Repeat for data/repair tasks; use only the final result. Cancel on refusal/incomplete. Never execute the business request during recognition; tools do not automatically intercept user messages.\nConfigured instances: " + JSON.stringify(Object.keys(bridgeConfig.instances)) + "\n",
    },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [...MCP_TOOLS],
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const args = request.params.arguments;
    let reply;
    if (!isObject(args))
      reply = {
        kind: "error",
        error: new IntentParseError(
          "INPUT_INVALID",
          "bridge",
          "Expected tool arguments.",
        ).toJSON(),
      };
    else if (request.params.name === "intent_prepare")
      reply = connection.prepare(args as unknown as PrepareRequest);
    else if (request.params.name === "intent_accept")
      reply = await connection.accept(args as unknown as AcceptRequest);
    else if (request.params.name === "intent_cancel")
      reply = connection.cancel(args as unknown as CancelRequest);
    else
      reply = {
        kind: "error",
        error: new IntentParseError(
          "INPUT_INVALID",
          "bridge",
          "Unknown intent tool.",
        ).toJSON(),
      };
    return {
      content: [{ type: "text" as const, text: JSON.stringify(reply) }],
      structuredContent: { ...reply },
      isError: reply.kind === "error",
    };
  });
  server.onclose = () => {
    connection.close();
    bridge.close();
  };
  try {
    await server.connect(transport ?? new StdioServerTransport());
  } catch (error) {
    connection.close();
    bridge.close();
    throw error;
  }
  return {
    async close() {
      connection.close();
      bridge.close();
      await server.close();
    },
  };
}
