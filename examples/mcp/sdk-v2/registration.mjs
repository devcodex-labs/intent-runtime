import { fromJsonSchema } from "@modelcontextprotocol/server";

/** SDK v2 registration glue. The caller supplies its own registry of tool names. */
export function registerIntentTools(server, adapter, existingNames) {
  const names = new Set(existingNames);
  for (const tool of adapter.tools)
    if (names.has(tool.name)) throw new Error("Tool name conflict: " + tool.name);
  const session = adapter.connect();
  const registrations = [];
  try {
    for (const tool of adapter.tools) registrations.push(server.registerTool(tool.name, {
      description: tool.description,
      inputSchema: fromJsonSchema(tool.inputSchema),
      ...(tool.outputSchema ? { outputSchema: fromJsonSchema(tool.outputSchema) } : {}),
    }, async (args, ctx) => {
      const reply = await session.callTool(tool.name, args, { signal: ctx.mcpReq.signal });
      if (!reply) throw new Error("Registered tool was not recognized by its adapter.");
      return { ...reply };
    }));
  } catch (error) {
    for (const registration of registrations) registration.remove();
    session.close(); throw error;
  }
  const previous = server.server.onclose;
  server.server.onclose = () => { session.close(); previous?.call(server.server); };
  return session;
}
