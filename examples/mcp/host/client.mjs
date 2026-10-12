import { fileURLToPath } from "node:url";
import { sampleInput } from "../../shared/instances.mjs";
import { createExampleExecutor } from "../../shared/candidate-driver.mjs";
import { openClient, recognizeThroughHost } from "../../shared/mcp-client.mjs";

const fixture = process.argv.includes("--fixture"), repair = process.argv.includes("--repair");
if (repair && !fixture) throw new Error("The controlled repair demonstration requires --fixture.");
const executor = createExampleExecutor(fixture);
const client = await openClient(process.execPath, [fileURLToPath(new URL("./server.mjs", import.meta.url))]);
try {
  const tools = await client.listTools();
  if (!tools.tools.some(tool => tool.name === "echo")) throw new Error("The original tool was lost.");
  await client.callTool({ name: "echo", arguments: { text: "Original tool still works." } });
  await client.listResources(); await client.listPrompts();
  const reply = await recognizeThroughHost(client, executor, sampleInput, { repair });
  console.log(JSON.stringify(reply, null, 2));
  if (reply.kind === "error") process.exitCode = 1;
} finally { await client.close(); }
