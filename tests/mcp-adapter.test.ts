import { afterEach, expect, it, vi } from "vitest";
import { Intent } from "../src/index.js";
import type { ModelRequest } from "../src/index.js";
import { createIntentMcpAdapter } from "../src/transports/mcp/adapter.js";
import type { IntentMcpAdapterConfig, IntentMcpToolResult } from "../src/transports/mcp/adapter.js";
import { MCP_TOOLS } from "../src/transports/mcp/index.js";
import { core, data, fakeExecutor, orderSchema } from "./fixtures.js";

const cleanup: Array<() => void> = [];
afterEach(() => { for (const close of cleanup.splice(0)) close(); vi.restoreAllMocks(); });
function decoded(result: IntentMcpToolResult | undefined) {
  expect(result).toBeDefined();
  return JSON.parse(result!.content[0]!.text);
}
function setup(mode: "host" | "executor" = "host", extra: Record<string, unknown> = {}) {
  const executor = fakeExecutor(core(), data(), core(), data());
  const intent = new Intent({ schema: orderSchema, ...(mode === "executor" ? { executor } : {}) });
  const adapter = createIntentMcpAdapter({ mode, instances: { orders: intent }, ...extra } as IntentMcpAdapterConfig);
  cleanup.push(() => { adapter.close(); intent.dispose(); });
  return { intent, adapter, executor, session: adapter.connect() };
}

it.each([null, [], {}, { mode: "other" }, { mode: null }, { instances: {} }, { instances: { bad: {} } }])(
  "rejects malformed adapter configuration: %j", config => {
    expect(() => createIntentMcpAdapter(config as never)).toThrowError(expect.objectContaining({ code: "CONFIG_INVALID" }));
  },
);
it.each([{ extra: true }, { toolPrefix: null }, { toolPrefix: 42 }, { toolPrefix: "space " }, { toolPrefix: "slash/" }, { toolPrefix: "x".repeat(115) },
  {maxJobs:null}, {maxReplayEntries:null}, {maxReplayBytes:null}, {jobTtlMs:null}, {replayTtlMs:null},
])(
  "rejects invalid config or tool names without mutating the instance: %j", extra => {
    const intent = new Intent(); cleanup.push(() => intent.dispose());
    expect(() => createIntentMcpAdapter({ instances: { general: intent }, ...extra } as never)).toThrowError(expect.objectContaining({ code: "CONFIG_INVALID" }));
    const healthy = createIntentMcpAdapter({ instances: { general: intent } });
    cleanup.push(() => healthy.close());
    expect(healthy.tools).toHaveLength(3);
  },
);

it("freezes isolated declarations, preserves old metadata and uses exact prefixed names", async () => {
  const original = structuredClone(MCP_TOOLS);
  const { adapter, session } = setup("host", { toolPrefix: "orders_" });
  expect(adapter.tools.map(tool => tool.name)).toEqual(["orders_intent_prepare", "orders_intent_accept", "orders_intent_cancel"]);
  expect(adapter.tools[0]!.inputSchema.properties?.instance).toEqual({ type: "string", enum: ["orders"] });
  expect(Reflect.set(adapter.tools[0]!.inputSchema, "type", "array")).toBe(false);
  expect(MCP_TOOLS).toEqual(original);
  expect(await session.callTool("intent_prepare", {})).toBeUndefined();
  expect(await session.callTool("orders_other", {})).toBeUndefined();
  expect(await session.callTool("__proto__", {})).toBeUndefined();
  expect(decoded(await session.callTool("orders_intent_prepare", { instance: "orders", input: "000123", fields: [] })).kind).toBe("task");
  const max = setup("host", { toolPrefix: "x".repeat(114) });
  expect(max.adapter.tools[0]!.name).toHaveLength(128);
});

it("keeps Bridge capacities host-only and shared across sessions", async () => {
  const { adapter, session } = setup("host", { maxJobs: 1 });
  await session.callTool("intent_prepare", { instance: "orders", input: "000123" });
  expect(decoded(await adapter.connect().callTool("intent_prepare", { instance: "orders", input: "next" })).error.code).toBe("LIMIT_EXCEEDED");
  const intent = new Intent({ executor: fakeExecutor(core()) }); cleanup.push(() => intent.dispose());
  expect(() => createIntentMcpAdapter({ mode: "executor", instances: { default: intent }, maxJobs: 1 } as never)).toThrowError(expect.objectContaining({ code: "CONFIG_INVALID" }));
});

it("runs core, repair, data and result with matching JSON and structured success", async () => {
  const { session } = setup();
  const first = await session.callTool("intent_prepare", { instance: "orders", input: "000123", context: "Explicit background" });
  let task = decoded(first);
  expect(first!.structuredContent).toEqual(task);
  const repair = await session.callTool("intent_accept", { jobId: task.jobId, stepToken: task.stepToken, candidateText: "{" });
  task = decoded(repair); expect(task.kind).toBe("task"); expect(JSON.parse(task.payload)).toHaveProperty("repair");
  const coreReply = await session.callTool("intent_accept", { jobId: task.jobId, stepToken: task.stepToken, candidateText: JSON.stringify(core()) });
  task = decoded(coreReply); expect(task.stage).toBe("data");
  const final = await session.callTool("intent_accept", { jobId: task.jobId, stepToken: task.stepToken, candidateText: JSON.stringify(data()) });
  const result = decoded(final);
  expect(result).toMatchObject({ kind: "result", result: { input: "000123", data: { orderId: "000123" } } });
  expect(final).toMatchObject({ structuredContent: result, isError: false });
});

it("does not expose structured errors and retains partialResult", async () => {
  const { session } = setup("executor");
  const result = await session.callTool("intent_parse", { instance: "orders", input: "000123", fields: [] });
  expect(decoded(result)).toMatchObject({ input: "000123", data: {} });
  expect(result!.structuredContent).toEqual(decoded(result));
  const invalid = await session.callTool("intent_parse", { instance: "orders", input: "000123", fields: ["unknown"] });
  expect(invalid).toMatchObject({ isError: true }); expect(invalid).not.toHaveProperty("structuredContent");
  expect(decoded(invalid).code).toBe("UNKNOWN_FIELD");
  const missing = { data: {}, evidence: [], descriptionChecks: [], fieldResults: [{ path: "/data/orderId", status: "issue", explanation: "Missing order." }], issues: [{ code: "DATA_REQUIRED_MISSING", category: "business_information", path: "/data/orderId", message: "Provide an order." }] };
  const intent = new Intent({ schema: orderSchema, executor: fakeExecutor(core(), missing) }); cleanup.push(() => intent.dispose());
  const adapter = createIntentMcpAdapter({ mode: "executor", instances: { orders: intent } }); cleanup.push(() => adapter.close());
  const failure = await adapter.connect().callTool("intent_parse", { instance: "orders", input: "000123" });
  expect(decoded(failure)).toMatchObject({ code: "DATA_EXTRACTION_FAILED", stage: "data", partialResult: { data: {} }, issues: [{ code: "DATA_REQUIRED_MISSING" }] });
  expect(failure).not.toHaveProperty("structuredContent");
});

it.each([null, [], {}, { instance: "unknown", input: "000123" }, { instance: "toString", input: "000123" }, { instance: "orders", input: " " }, { instance: "orders", input: "000123", context: null }, { instance: "orders", input: "000123", extra: true }])(
  "returns executor input failures through the tool contract: %j", async args => {
    const { session, executor } = setup("executor");
    expect(decoded(await session.callTool("intent_parse", args))).toMatchObject({ code: "INPUT_INVALID" });
    expect(executor.generate).not.toHaveBeenCalled();
  },
);

it("reports missing executors and refusal/incomplete without implicit host calls", async () => {
  const without = new Intent(); cleanup.push(() => without.dispose());
  const adapter = createIntentMcpAdapter({ mode: "executor", instances: { general: without } }); cleanup.push(() => adapter.close());
  expect(decoded(await adapter.connect().callTool("intent_parse", { instance: "general", input: "000123" })).code).toBe("EXECUTOR_NOT_CONFIGURED");
  for (const [outcome, code] of [["refusal", "MODEL_REFUSED"], ["incomplete", "MODEL_OUTPUT_INCOMPLETE"]] as const) {
    const intent = new Intent({ executor: { ...fakeExecutor(), async generate() { return { outcome }; } } }); cleanup.push(() => intent.dispose());
    const owned = createIntentMcpAdapter({ mode: "executor", instances: { general: intent } }); cleanup.push(() => owned.close());
    expect(decoded(await owned.connect().callTool("intent_parse", { instance: "general", input: "000123" })).code).toBe(code);
  }
});

it("preserves owner isolation and idempotent replay and classifies cancellation", async () => {
  const { adapter, session } = setup();
  const task = decoded(await session.callTool("intent_prepare", { instance: "orders", input: "000123", fields: [] }));
  const request = { jobId: task.jobId, stepToken: task.stepToken, candidateText: JSON.stringify(core()) };
  const other = adapter.connect();
  expect(decoded(await other.callTool("intent_accept", request)).error.code).toBe("BRIDGE_JOB_NOT_FOUND");
  const result = await session.callTool("intent_accept", request);
  expect(await session.callTool("intent_accept", request)).toEqual(result);
  expect(decoded(await session.callTool("intent_accept", { ...request, candidateText: "{}" })).error.code).toBe("BRIDGE_STEP_CONFLICT");
  for (const [outcome, code] of [["cancelled", "MODEL_ABORTED"], ["refusal", "MODEL_REFUSED"], ["incomplete", "MODEL_OUTPUT_INCOMPLETE"]]) {
    const pending = decoded(await session.callTool("intent_prepare", { instance: "orders", input: "000123" }));
    const failure = await session.callTool("intent_cancel", { jobId: pending.jobId, outcome });
    expect(decoded(failure).error.code).toBe(code); expect(failure).not.toHaveProperty("structuredContent");
  }
});

it("does not create jobs on cancelled prepare and does not accept signal as JSON", async () => {
  const { adapter, session } = setup("host", { maxJobs: 1 });
  const controller = new AbortController(); controller.abort();
  expect(decoded(await session.callTool("intent_prepare", { instance: "orders", input: "000123" }, { signal: controller.signal })).error.code).toBe("MODEL_ABORTED");
  expect(decoded(await session.callTool("intent_prepare", { instance: "orders", input: "000123", signal: controller.signal })).error.code).toBe("INPUT_INVALID");
  const next = decoded(await adapter.connect().callTool("intent_prepare", { instance: "orders", input: "000123" }));
  expect(next.kind).toBe("task");
});

it.each(["session", "adapter"] as const)("closes %s idempotently without disposing caller instances", async target => {
  const { intent, adapter, session } = setup();
  const task = decoded(await session.callTool("intent_prepare", { instance: "orders", input: "000123" }));
  const dispose = vi.spyOn(intent, "dispose");
  const owner = target === "session" ? session : adapter;
  owner.close(); owner.close();
  expect(decoded(await session.callTool("intent_accept", { jobId: task.jobId, stepToken: task.stepToken, candidateText: "{}" })).error.code).toBe("BRIDGE_JOB_NOT_FOUND");
  expect(await session.callTool("other", {})).toBeUndefined(); expect(dispose).not.toHaveBeenCalled();
  if (target === "adapter") expect(() => adapter.connect()).toThrowError(expect.objectContaining({ code: "BRIDGE_JOB_NOT_FOUND" }));
  else expect(decoded(await adapter.connect().callTool("intent_prepare", { instance: "orders", input: "new" })).kind).toBe("task");
  const reused = createIntentMcpAdapter({ instances: { orders: intent } }); cleanup.push(() => reused.close());
  expect(decoded(await reused.connect().callTool("intent_prepare", { instance: "orders", input: "reuse", fields: [] })).kind).toBe("task");
});

it("session shutdown cancels its owned parse but preserves another session on the same instance", async () => {
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const executor = { ...fakeExecutor(), generate: vi.fn(async (request: ModelRequest) => {
    if (JSON.parse(request.payload).currentInput === "wait") {
      entered();
      return new Promise<never>((_resolve, reject) => request.signal.addEventListener("abort", () => reject(request.signal.reason), { once: true }));
    }
    return { outcome: "complete" as const, text: JSON.stringify(core()) };
  }) };
  const intent = new Intent({ executor }); cleanup.push(() => intent.dispose());
  const adapter = createIntentMcpAdapter({ mode: "executor", instances: { general: intent } }); cleanup.push(() => adapter.close());
  const owned = adapter.connect(), other = adapter.connect();
  const pending = owned.callTool("intent_parse", { instance: "general", input: "wait" });
  await started;
  owned.close();
  expect(decoded(await pending).code).toBe("MODEL_ABORTED");
  expect(decoded(await other.callTool("intent_parse", { instance: "general", input: "000123" }))).toMatchObject({ input: "000123" });
});

it("adapter shutdown cancels all its sessions while another adapter retains the shared instance", async () => {
  let entered!: () => void, finishOther!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const signals: AbortSignal[] = [];
  const executor = { ...fakeExecutor(), async generate(request: ModelRequest) {
    signals.push(request.signal);
    if (signals.length === 3) entered();
    return new Promise<{outcome:"complete";text:string}>((resolve, reject) => {
      request.signal.addEventListener("abort", () => reject(request.signal.reason), {once:true});
      if (JSON.parse(request.payload).currentInput === "other")
        finishOther = () => resolve({outcome:"complete",text:JSON.stringify(core())});
    });
  } };
  const intent = new Intent({executor}); cleanup.push(() => intent.dispose());
  const adapter = createIntentMcpAdapter({mode:"executor",instances:{general:intent}});
  const other = createIntentMcpAdapter({mode:"executor",instances:{general:intent}});
  cleanup.push(() => {adapter.close();other.close();});
  const pending = ["first","second"].map(input => adapter.connect().callTool("intent_parse",{instance:"general",input,fields:[]}));
  const unaffected = other.connect().callTool("intent_parse",{instance:"general",input:"other",fields:[]});
  await started; adapter.close();
  for (const result of await Promise.all(pending)) expect(decoded(result).code).toBe("MODEL_ABORTED");
  expect(signals.map(signal => signal.aborted)).toEqual([true,true,false]);
  finishOther();
  expect(decoded(await unaffected)).toMatchObject({input:"other",data:{}});
});
