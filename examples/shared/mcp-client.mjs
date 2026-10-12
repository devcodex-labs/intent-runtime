import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import { delimiter, resolve } from "node:path";

export async function openClient(command, args, cwd = process.cwd()) {
  const env = getDefaultEnvironment();
  env.PATH = resolve(cwd, "node_modules/.bin") + delimiter + (env.PATH ?? "");
  for (const [name, value] of Object.entries(process.env))
    if (name.startsWith("INTENT_") && value !== undefined) env[name] = value;
  const transport = new StdioClientTransport({ command, args, cwd, env, stderr: "pipe" });
  transport.stderr?.on("data", chunk => process.stderr.write(chunk));
  const client = new Client({ name: "intent-runtime-example-client", version: "1.0.0" });
  try { await client.connect(transport); return client; }
  catch (error) { await transport.close(); throw error; }
}

/** Error text remains readable even when a host adds a success-only outputSchema. */
export function readReply(result) {
  const text = result.content.find(item => item.type === "text");
  if (!text || text.type !== "text") throw new Error("Expected JSON tool text.");
  return result.structuredContent ?? JSON.parse(text.text);
}

export async function recognizeThroughHost(client, executor, input, { repair = false } = {}) {
  let reply = readReply(await client.callTool({ name: "intent_prepare", arguments: { instance: "orders", input, fields: ["orderId"] } }));
  let injected = false;
  while (reply.kind === "task") {
    let candidate;
    try { candidate = await executor.generate({ stage: reply.stage, instructions: reply.instructions, payload: reply.payload, format: reply.format, signal: new AbortController().signal }); }
    catch {
      await client.callTool({ name: "intent_cancel", arguments: { jobId: reply.jobId } });
      throw new Error("Candidate generation failed; the owned job was cancelled.");
    }
    if (candidate.outcome !== "complete") return readReply(await client.callTool({ name: "intent_cancel", arguments: { jobId: reply.jobId, outcome: candidate.outcome } }));
    const candidateText = repair && !injected ? "{" : candidate.text;
    injected = true;
    reply = readReply(await client.callTool({ name: "intent_accept", arguments: { jobId: reply.jobId, stepToken: reply.stepToken, candidateText } }));
  }
  return reply;
}
