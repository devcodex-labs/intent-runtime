import {createIntentMcpAdapter} from '@devcodex/intent-runtime/mcp';

// The existing SDK owns negotiation, standard transport, resources and prompts.
// Pass a verified protocol version and retain one session per logical client.
export async function attachIntentTools(original, config, connection) {
  const adapter = createIntentMcpAdapter(config);
  const check = async () => {
    const tools = await original.listTools();
    const names = new Set();
    for (const tool of [...tools, ...adapter.tools]) {
      if (names.has(tool.name)) throw new Error('Duplicate MCP tool name: ' + tool.name + '. Rename the conflicting tool or choose a non-conflicting toolPrefix.');
      names.add(tool.name);
    }
    return tools;
  };
  try {
    await check();
    const session = adapter.connect(connection);
    return {
      async listTools() {return [...await check(), ...adapter.tools];},
      async callTool(name, args, options) {
        await check();
        const own = await session.callTool(name, args, options);
        return own === undefined ? original.callTool(name, args, options) : own;
      },
      async close() {try {await session.close();} finally {await adapter.close();}},
    };
  } catch (error) {await adapter.close(); throw error;}
}
