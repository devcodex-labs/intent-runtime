import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { createIntentBridge } from "../../bridge/index.js";
import type { BridgeConfig } from "../../bridge/index.js";
import { MCP_TOOLS } from "./definitions.js";
import { dispatchHost, toolResult } from "./dispatch.js";
export { MCP_TOOLS } from "./definitions.js";
import { readFileSync } from "node:fs";
const packageVersion = (JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")) as { version: string }).version;
export async function serveIntentMcp(
  config: BridgeConfig & { transport?: Transport },
): Promise<{ close(): Promise<void> }> {
  const { transport, ...bridgeConfig } = config;
  const bridge = createIntentBridge(bridgeConfig);
  const connection = bridge.connect();
  const server = new Server(
    { name: "intent-runtime", version: packageVersion },
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
    const reply = await dispatchHost(connection, request.params.name, request.params.arguments);
    return { ...toolResult(reply, reply.kind === "error", true) };
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
