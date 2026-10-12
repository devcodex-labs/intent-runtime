import { fileURLToPath } from "node:url";
import { sampleInput } from "../../shared/instances.mjs";
import { openClient, readReply } from "../../shared/mcp-client.mjs";

const flags = process.argv.includes("--fixture") ? ["--fixture"] : [];
const client = await openClient(process.execPath, [fileURLToPath(new URL("./server.mjs", import.meta.url)), ...flags]);
try {
  const listed = await client.listTools();
  if (!listed.tools.some(tool => tool.name === "echo")) throw new Error("The original tool was lost.");
  await client.callTool({ name: "echo", arguments: { text: "Original tool still works." } });
  await client.readResource({ uri: "project://config" });
  await client.getPrompt({ name: "project_help" });
  const reply = await client.callTool({ name: "intent_parse", arguments: { instance: "orders", input: sampleInput, fields: ["orderId"] } });
  console.log(JSON.stringify(readReply(reply), null, 2));
  if (reply.isError) process.exitCode = 1;
} finally { await client.close(); }
