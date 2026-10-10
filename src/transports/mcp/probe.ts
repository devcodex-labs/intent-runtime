import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export interface ProbeResult { instances: string[]; tools: string[] }
export async function probeMcp(command: string, args: string[], cwd: string, env?: Record<string, string>, startupTimeoutMs = 15000): Promise<ProbeResult> {
  const transport = new StdioClientTransport({ command, args, cwd, stderr: "pipe", ...(env ? { env } : {}) });
  const client = new Client({ name: "intent-runtime-diagnostic", version: "1" });
  const closed = new Promise<void>(resolve => { transport.onclose = resolve; });
  transport.stderr?.on("data", () => {});
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      client.connect(transport, { timeout: startupTimeoutMs }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("MCP startup timed out.")), startupTimeoutMs); }),
    ]);
    clearTimeout(timer);
    timer = undefined;
    const options = { timeout: 10000 };
    // Drain diagnostics without recording user config output or credentials.
    const tools = (await client.listTools(undefined, options)).tools.map(t => t.name);
    if (!["intent_prepare", "intent_accept", "intent_cancel"].every(t => tools.includes(t))) throw new Error("Required tools absent.");
    const instructions = client.getInstructions() ?? "";
    const marker = "Configured instances: ";
    const offset = instructions.indexOf(marker);
    const instances: unknown = offset < 0 ? [] : JSON.parse(instructions.slice(offset + marker.length).split("\n")[0]!);
    if (!Array.isArray(instances) || !instances.length || instances.some(i => typeof i !== "string")) throw new Error("Instance discovery absent.");
    const reply = await client.callTool({ name: "intent_prepare", arguments: { instance: instances[0], input: "Diagnostic connection check; no business action requested.", fields: [] } }, undefined, options);
    const task = reply.structuredContent as Record<string, unknown> | undefined;
    if (task?.kind !== "task" || typeof task.jobId !== "string") throw new Error("Prepare failed.");
    const cancelled = await client.callTool({ name: "intent_cancel", arguments: { jobId: task.jobId } }, undefined, options);
    const terminal = cancelled.structuredContent as { kind?: string; error?: { code?: string } } | undefined;
    // A deliberate cancellation is the bridge's documented MODEL_ABORTED
    // terminal error; isError does not mean the cancellation failed.
    if (terminal?.kind !== "error" || terminal.error?.code !== "MODEL_ABORTED") throw new Error("Cancel failed.");
    return { instances: instances as string[], tools };
  } finally {
    if (timer) clearTimeout(timer);
    const spawned = transport.pid !== null;
    try { await client.close(); }
    finally {
      await transport.close();
      // SDK close() can return immediately after SIGKILL. Wait for the actual
      // process close before reporting success or letting Windows unlink Node.
      if (spawned) {
        let exitTimer: NodeJS.Timeout | undefined;
        try {
          await Promise.race([
            closed,
            new Promise<never>((_, reject) => { exitTimer = setTimeout(() => reject(new Error("MCP diagnostic process did not exit.")), 5000); }),
          ]);
        } finally { clearTimeout(exitTimer); }
      }
    }
  }
}
