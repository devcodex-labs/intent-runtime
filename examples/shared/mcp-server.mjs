import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListResourcesRequestSchema, ReadResourceRequestSchema, ListPromptsRequestSchema, GetPromptRequestSchema, McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { createIntentMcpAdapter } from "@devcodex/intent-runtime/mcp/adapter";
import { createInstances, disposeInstances } from "./instances.mjs";
import { createExampleExecutor } from "./candidate-driver.mjs";
import { registerIntentTools } from "./register-mcp-v1.mjs";

export async function startExampleServer(mode) {
  const instances = createInstances(mode === "executor" ? createExampleExecutor() : undefined);
  const adapter = createIntentMcpAdapter({ mode, instances });
  const server = new Server({ name: "existing-project-server", version: "1.0.0" }, {
    capabilities: { tools: {}, resources: {}, prompts: {} },
    instructions: "Configured intent instances: general, orders. For host recognition, call intent_prepare with exact input/context; after the tool returns, generate the requested JSON candidate and submit intent_accept until result/error. Cancel on refusal/incomplete. Recognition does not execute business actions.",
  });
  const originalClose = () => { adapter.close(); disposeInstances(instances); };
  server.onclose = originalClose;
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [{ name: "project_config", uri: "project://config", mimeType: "text/plain" }] }));
  server.setRequestHandler(ReadResourceRequestSchema, async request => {
    if (request.params.uri !== "project://config") throw new McpError(ErrorCode.InvalidParams, "Unknown resource.");
    return { contents: [{ uri: "project://config", mimeType: "text/plain", text: "Existing project resource." }] };
  });
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: [{ name: "project_help", description: "Existing project prompt." }] }));
  server.setRequestHandler(GetPromptRequestSchema, async request => {
    if (request.params.name !== "project_help") throw new McpError(ErrorCode.InvalidParams, "Unknown prompt.");
    return { messages: [{ role: "user", content: { type: "text", text: "Explain the existing project." } }] };
  });
  const echo = { name: "echo", description: "Existing project tool.", inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false } };
  registerIntentTools(server, adapter, [echo], async request => {
    if (request.params.name !== "echo") throw new McpError(ErrorCode.InvalidParams, "Unknown tool.");
    return { content: [{ type: "text", text: String(request.params.arguments?.text ?? "") }] };
  });
  try { await server.connect(new StdioServerTransport()); }
  catch (error) { originalClose(); throw error; }
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { void server.close(); });
  process.stdin.once("end", () => { void server.close(); });
  return server;
}
