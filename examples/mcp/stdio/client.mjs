import { fileURLToPath } from "node:url";
import { sampleInput } from "../../shared/instances.mjs";
import { createExampleExecutor } from "../../shared/candidate-driver.mjs";
import { openClient, recognizeThroughHost } from "../../shared/mcp-client.mjs";

const executor = createExampleExecutor();
const config = fileURLToPath(new URL("./intent.config.mjs", import.meta.url));
const client = await openClient("intent-runtime-mcp", ["--config", config]);
try {
  const tools = await client.listTools();
  if (tools.tools.length !== 3) throw new Error("Expected the three production CLI tools.");
  const reply = await recognizeThroughHost(client, executor, sampleInput);
  console.log(JSON.stringify(reply, null, 2));
  if (reply.kind === "error") process.exitCode = 1;
} finally { await client.close(); }
