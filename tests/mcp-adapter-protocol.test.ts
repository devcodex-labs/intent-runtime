import { afterEach, expect, it, vi } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolRequestSchema, CallToolResultSchema, ListToolsRequestSchema, ListResourcesRequestSchema, ListPromptsRequestSchema, McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { Intent } from "../src/index.js";
import type { ModelRequest } from "../src/index.js";
import { createIntentMcpAdapter } from "../src/transports/mcp/adapter.js";
import type { BridgeReply } from "../src/bridge/index.js";
import { core, data, fakeExecutor, orderSchema } from "./fixtures.js";

const cleanup: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
async function setup(mode: "host" | "executor", schema = false) {
  const intent = new Intent({ schema: orderSchema, executor: fakeExecutor(core(), data(), core(), data()) });
  const adapter = createIntentMcpAdapter({ mode, instances: { orders: intent }, toolPrefix: "orders_" });
  const session = adapter.connect();
  const server = new Server({ name: "existing-server", version: "1.0.0" }, { capabilities: { tools: {}, resources: {}, prompts: {} } });
  const existingClose = vi.fn(); server.onclose = existingClose;
  const echo = { name: "echo", inputSchema: { type: "object" as const, properties: { text: { type: "string" } } } };
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [echo, ...adapter.tools.map(tool => ({ ...tool,
    ...(schema ? { outputSchema: { type: "object" as const, required: [mode === "executor" ? "input" : "kind"], properties: { [mode === "executor" ? "input" : "kind"]: { type: "string" } } } } : {}),
  }))] }));
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [{ uri: "existing://config", name: "config" }] }));
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: [{ name: "existing_prompt" }] }));
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const reply = await session.callTool(request.params.name, request.params.arguments, { signal: extra.signal });
    if (reply) return { ...reply };
    if (request.params.name === "echo") return { content: [{ type: "text" as const, text: String(request.params.arguments?.text) }] };
    throw new McpError(ErrorCode.InvalidParams, "Unknown tool.");
  });
  const previous = server.onclose;
  server.onclose = () => { session.close(); previous?.call(server); };
  const client = new Client({ name: "adapter-protocol-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);
  cleanup.push(() => { adapter.close(); intent.dispose(); });
  cleanup.push(() => server.close()); cleanup.push(() => client.close());
  return { client, session, existingClose };
}

it.each(["host", "executor"] as const)("coexists with original SDK tools/resources/prompts in %s mode", async mode => {
  const { client, existingClose } = await setup(mode);
  const names = (await client.listTools()).tools.map(tool => tool.name);
  expect(names).toEqual(mode === "host" ? ["echo", "orders_intent_prepare", "orders_intent_accept", "orders_intent_cancel"] : ["echo", "orders_intent_parse"]);
  expect((await client.callTool({ name: "echo", arguments: { text: "original" } })).content).toEqual([{ type: "text", text: "original" }]);
  expect((await client.listResources()).resources[0]!.uri).toBe("existing://config");
  expect((await client.listPrompts()).prompts[0]!.name).toBe("existing_prompt");
  await expect(client.callTool({ name: "orders_other", arguments: {} })).rejects.toThrow("Unknown tool");
  await client.close(); expect(existingClose).toHaveBeenCalledTimes(1);
});

it.each([false, true])("executor success and errors are consumable by the SDK client (outputSchema=%s)", async schema => {
  const { client } = await setup("executor", schema);
  await client.listTools();
  const result = await client.callTool({ name: "orders_intent_parse", arguments: { instance: "orders", input: "000123" } });
  expect(result.structuredContent).toMatchObject({ input: "000123", data: { orderId: "000123" } });
  const failed = await client.callTool({ name: "orders_intent_parse", arguments: { instance: "orders", input: "000123", fields: ["missing"] } });
  expect(failed.isError).toBe(true); expect(failed).not.toHaveProperty("structuredContent");
  const text = CallToolResultSchema.parse(failed).content[0]; if (text?.type !== "text") throw new Error("Expected text");
  expect(JSON.parse(text.text).code).toBe("UNKNOWN_FIELD");
});

it.each([false, true])("host core/data/results and errors are consumable by the SDK client (outputSchema=%s)", async schema => {
  const { client } = await setup("host", schema); await client.listTools();
  const prepared = await client.callTool({ name: "orders_intent_prepare", arguments: { instance: "orders", input: "000123" } });
  const first = prepared.structuredContent as BridgeReply;
  if (first.kind !== "task") throw new Error("Expected core task");
  const coreReply = await client.callTool({ name: "orders_intent_accept", arguments: { jobId: first.jobId, stepToken: first.stepToken, candidateText: JSON.stringify(core()) } });
  const next = coreReply.structuredContent as BridgeReply;
  if (next.kind !== "task") throw new Error("Expected data task");
  const result = await client.callTool({ name: "orders_intent_accept", arguments: { jobId: next.jobId, stepToken: next.stepToken, candidateText: JSON.stringify(data()) } });
  expect(result.structuredContent).toMatchObject({ kind: "result", result: { data: { orderId: "000123" } } });
  const failed = await client.callTool({ name: "orders_intent_accept", arguments: { jobId: next.jobId, stepToken: "forged", candidateText: "{}" } });
  expect(failed.isError).toBe(true); expect(failed).not.toHaveProperty("structuredContent");
});

it("rejects structured errors that do not match a success-only outputSchema", async () => {
  const server = new Server({ name: "bad-schema-server", version: "1.0.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [{ name: "bad_error", inputSchema: { type: "object" as const }, outputSchema: { type: "object" as const, required: ["input"], properties: { input: { type: "string" } } } }] }));
  server.setRequestHandler(CallToolRequestSchema, async () => ({ isError: true, content: [{ type: "text" as const, text: "error" }], structuredContent: { error: { code: "INPUT_INVALID" } } }));
  const client = new Client({ name: "output-schema-test", version: "1.0.0" });
  const [ct, st] = InMemoryTransport.createLinkedPair(); await server.connect(st); await client.connect(ct);
  cleanup.push(() => server.close()); cleanup.push(() => client.close());
  await client.listTools(); await expect(client.callTool({ name: "bad_error", arguments: {} })).rejects.toThrow(/output schema/i);
});

it("forwards SDK request cancellation without disposing a shared instance", async () => {
  let entered!: () => void, stopped!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const aborted = new Promise<void>(resolve => { stopped = resolve; });
  const executor = { ...fakeExecutor(), async generate(request: ModelRequest) {
    if (JSON.parse(request.payload).currentInput !== "wait") return { outcome: "complete" as const, text: JSON.stringify(core()) };
    entered();
    return new Promise<never>((_resolve, reject) => request.signal.addEventListener("abort", () => { stopped(); reject(request.signal.reason); }, { once: true }));
  } };
  const intent = new Intent({ executor }); const adapter = createIntentMcpAdapter({ mode: "executor", instances: { general: intent } }); const session = adapter.connect();
  const server = new Server({ name: "request-cancel-server", version: "1.0.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [...adapter.tools] }));
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => ({ ...await session.callTool(request.params.name, request.params.arguments, { signal: extra.signal })! }));
  const client = new Client({ name: "request-cancel-client", version: "1.0.0" });
  const [ct, st] = InMemoryTransport.createLinkedPair(); await server.connect(st); await client.connect(ct);
  cleanup.push(() => { adapter.close(); intent.dispose(); }); cleanup.push(() => server.close()); cleanup.push(() => client.close());
  const controller = new AbortController();
  const pending = client.callTool({ name: "intent_parse", arguments: { instance: "general", input: "wait" } }, undefined, { signal: controller.signal });
  const rejected = expect(pending).rejects.toThrow();
  await started; controller.abort(); await rejected; await aborted;
  expect((await client.callTool({ name: "intent_parse", arguments: { instance: "general", input: "reuse", fields: [] } })).structuredContent).toMatchObject({ input: "reuse" });
});
