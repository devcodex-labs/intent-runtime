import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export interface ProbeResult { instances: string[]; tools: string[] }
export async function probeMcp(command: string, args: string[], cwd: string, env?: Record<string, string>, timeoutMs = 10000): Promise<ProbeResult> {
  const transport = new StdioClientTransport({ command, args, cwd, stderr: "pipe", ...(env ? { env } : {}) });
  const client = new Client({ name: "intent-runtime-diagnostic", version: "1" });
  transport.stderr?.on("data", () => {});
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      (async () => {
        await client.connect(transport);
        // Drain diagnostics without recording user config output or credentials.
        const tools = (await client.listTools()).tools.map(t => t.name);
        if (!["intent_prepare", "intent_accept", "intent_cancel"].every(t => tools.includes(t))) throw new Error("Required tools absent.");
        const instructions = client.getInstructions() ?? "";
        const marker = "Configured instances: ";
        const offset = instructions.indexOf(marker);
        const instances: unknown = offset < 0 ? [] : JSON.parse(instructions.slice(offset + marker.length).split("\n")[0]!);
        if (!Array.isArray(instances) || !instances.length || instances.some(i => typeof i !== "string")) throw new Error("Instance discovery absent.");
        const reply = await client.callTool({ name: "intent_prepare", arguments: { instance: instances[0], input: "Diagnostic connection check; no business action requested.", fields: [] } });
        const task = reply.structuredContent as Record<string, unknown> | undefined;
        if (task?.kind !== "task" || typeof task.jobId !== "string") throw new Error("Prepare failed.");
        const cancelled = await client.callTool({ name: "intent_cancel", arguments: { jobId: task.jobId } });
        const terminal = cancelled.structuredContent as { kind?: string; error?: { code?: string } } | undefined;
        // A deliberate cancellation is the bridge's documented MODEL_ABORTED
        // terminal error; isError does not mean the cancellation failed.
        if (terminal?.kind !== "error" || terminal.error?.code !== "MODEL_ABORTED") throw new Error("Cancel failed.");
        return { instances: instances as string[], tools };
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("MCP probe timed out.")), timeoutMs); }),
    ]);
  } finally { if (timer) clearTimeout(timer); await client.close(); await transport.close(); }
}
