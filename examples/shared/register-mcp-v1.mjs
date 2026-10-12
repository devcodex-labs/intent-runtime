import { ListToolsRequestSchema, CallToolRequestSchema, McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

/** Glue for a low-level SDK v1 Server. Supply the project's original dispatcher. */
export function registerIntentTools(server, adapter, existingTools, existingCallTool) {
  const names = new Set(existingTools.map(tool => tool.name));
  for (const tool of adapter.tools)
    if (names.has(tool.name)) throw new Error("Tool name conflict: " + tool.name);
  const session = adapter.connect();
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [...existingTools, ...adapter.tools] }));
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const reply = await session.callTool(request.params.name, request.params.arguments, { signal: extra.signal });
    if (reply) return { ...reply };
    if (existingCallTool) return existingCallTool(request, extra);
    throw new McpError(ErrorCode.InvalidParams, "Unknown tool.");
  });
  const previousOnClose = server.onclose;
  server.onclose = () => { session.close(); previousOnClose?.call(server); };
  return session;
}
