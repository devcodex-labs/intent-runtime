import { afterEach, expect, it, vi } from "vitest";
import { Intent } from "../src/index.js";
import type { ModelRequest } from "../src/index.js";
import { createIntentBridge } from "../src/bridge/index.js";
import type { BridgeReply } from "../src/bridge/index.js";
import { core, data, fakeExecutor, orderSchema } from "./fixtures.js";

const cleanup: Array<() => void> = [];
afterEach(() => { for (const close of cleanup.splice(0)) close(); vi.restoreAllMocks(); });
function bridgeSetup() {
  const intent = new Intent({ schema: orderSchema });
  const bridge = createIntentBridge({ instances: { orders: intent }, maxJobs: 1 });
  cleanup.push(() => { bridge.close(); intent.dispose(); });
  const session = bridge.connect();
  const prepared = session.prepare({ instance: "orders", input: "000123" });
  if (prepared.kind !== "task") throw new Error("Expected initial task");
  return { bridge, session, prepared };
}
function task(reply: BridgeReply) {
  expect(reply.kind).toBe("task");
  if (reply.kind !== "task") throw new Error("Expected task");
  return reply;
}

it.each([null, [], "signal", { unknown: true }, { signal: {} }, { signal: null }, { signal: new AbortController() }])(
  "rejects malformed native parse options before model generation: %j", async options => {
    const executor = fakeExecutor(core());
    const intent = new Intent({ executor }); cleanup.push(() => intent.dispose());
    await expect(Reflect.apply(intent.parse, intent, [{ input: "000123" }, options])).rejects.toMatchObject({ code: "INPUT_INVALID" });
    expect(executor.generate).not.toHaveBeenCalled();
  },
);

it("keeps optional options compatible and out of JSON payloads", async () => {
  const executor = fakeExecutor(core(), core());
  const intent = new Intent({ executor }); cleanup.push(() => intent.dispose());
  const signal = new AbortController().signal;
  await intent.parse({ input: "000123" }, {});
  await intent.parse({ input: "000123" }, { signal });
  expect(executor.generate.mock.calls.map(([request]) => request.payload)).toEqual([
    executor.generate.mock.calls[0]![0].payload, executor.generate.mock.calls[0]![0].payload,
  ]);
  await expect(Reflect.apply(intent.parse, intent, [{ input: "000123" }, {}, {}])).rejects.toMatchObject({ code: "INPUT_INVALID" });
  await expect(intent.parse({ input: "000123", signal } as never)).rejects.toMatchObject({ code: "INPUT_INVALID" });
});

it.each(["already", "queued"])("does not call the model when cancellation is %s", async timing => {
  const executor = fakeExecutor(core());
  const intent = new Intent({ executor, limits: { maxConcurrentParses: 1 } }); cleanup.push(() => intent.dispose());
  const controller = new AbortController();
  if (timing === "already") controller.abort(new Error("private caller reason"));
  const pending = intent.parse({ input: "000123" }, { signal: controller.signal });
  const rejected = expect(pending).rejects.toMatchObject({ code: "MODEL_ABORTED", stage: "core" });
  if (timing === "queued") controller.abort();
  await rejected;
  expect(executor.generate).not.toHaveBeenCalled();
  expect((await intent.parse({ input: "000123" })).input).toBe("000123");
});

it("cancels one active call while another shared-instance request completes", async () => {
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const executor = {
    ...fakeExecutor(),
    generate: vi.fn(async (request: ModelRequest) => {
      if (JSON.parse(request.payload).currentInput === "wait") {
        entered();
        return new Promise<never>((_resolve, reject) => request.signal.addEventListener("abort", () => reject(request.signal.reason), { once: true }));
      }
      return { outcome: "complete" as const, text: JSON.stringify(core()) };
    }),
  };
  const intent = new Intent({ executor }); cleanup.push(() => intent.dispose());
  const controller = new AbortController();
  const add = vi.spyOn(controller.signal, "addEventListener"), remove = vi.spyOn(controller.signal, "removeEventListener");
  const pending = intent.parse({ input: "wait" }, { signal: controller.signal });
  const rejected = expect(pending).rejects.toMatchObject({ code: "MODEL_ABORTED" });
  await started;
  const successful = intent.parse({ input: "000123" });
  controller.abort(new Error("private reason must not leak"));
  await rejected;
  expect((await successful).input).toBe("000123");
  expect((await intent.parse({ input: "reuse" })).input).toBe("reuse");
  expect(remove.mock.calls[0]![1]).toBe(add.mock.calls[0]![1]);
});

it("retains the core result when cancelled during data generation", async () => {
  let reached!: () => void;
  const entered = new Promise<void>(resolve => { reached = resolve; });
  const executor = { ...fakeExecutor(), generate: vi.fn(async (request: ModelRequest) => {
    if (request.stage === "core") return { outcome: "complete" as const, text: JSON.stringify(core()) };
    reached();
    return new Promise<never>((_resolve, reject) => request.signal.addEventListener("abort", () => reject(request.signal.reason), { once: true }));
  }) };
  const intent = new Intent({ schema: orderSchema, executor }); cleanup.push(() => intent.dispose());
  const controller = new AbortController();
  const pending = intent.parse({ input: "000123" }, { signal: controller.signal });
  const rejected = expect(pending).rejects.toMatchObject({ code: "MODEL_ABORTED", stage: "data", partialResult: { input: "000123", data: {} } });
  await entered; controller.abort(); await rejected;
  expect((await intent.parse({ input: "reuse", fields: [] })).data).toEqual({});
});

it("removes the caller listener on model failure and does not expose its reason", async () => {
  const controller = new AbortController();
  const add = vi.spyOn(controller.signal, "addEventListener"), remove = vi.spyOn(controller.signal, "removeEventListener");
  const intent = new Intent({ executor: { ...fakeExecutor(), async generate() { throw new Error("provider details"); } } });
  cleanup.push(() => intent.dispose());
  await expect(intent.parse({ input: "000123" }, { signal: controller.signal })).rejects.toMatchObject({ code: "MODEL_REQUEST_FAILED" });
  expect(remove.mock.calls[0]![1]).toBe(add.mock.calls[0]![1]);
});

it("validates accept ownership/token/conflicts before applying cancellation", async () => {
  const { bridge, session, prepared } = bridgeSetup();
  const controller = new AbortController(); controller.abort();
  const valid = { jobId: prepared.jobId, stepToken: prepared.stepToken, candidateText: JSON.stringify(core()) };
  expect(await bridge.connect().accept(valid, { signal: controller.signal })).toMatchObject({ kind: "error", error: { code: "BRIDGE_JOB_NOT_FOUND" } });
  expect(await session.accept({ ...valid, stepToken: "forged" }, { signal: controller.signal })).toMatchObject({ kind: "error", error: { code: "BRIDGE_STEP_CONFLICT" } });
  expect(await session.accept(valid, { signal: {} } as never)).toMatchObject({ kind: "error", error: { code: "INPUT_INVALID" } });
  const pending = session.accept(valid);
  expect(await session.accept({ ...valid, candidateText: "{}" }, { signal: controller.signal })).toMatchObject({ kind: "error", error: { code: "BRIDGE_STEP_CONFLICT" } });
  const next = task(await pending);
  expect((await session.accept({ jobId: next.jobId, stepToken: next.stepToken, candidateText: JSON.stringify(data()) })).kind).toBe("result");
});

it("does not bind cancellation on an old replay or after the step advances", async () => {
  const { session, prepared } = bridgeSetup();
  const controller = new AbortController();
  const add = vi.spyOn(controller.signal, "addEventListener"), remove = vi.spyOn(controller.signal, "removeEventListener");
  const request = { jobId: prepared.jobId, stepToken: prepared.stepToken, candidateText: JSON.stringify(core()) };
  const next = task(await session.accept(request, { signal: controller.signal }));
  controller.abort();
  expect(await session.accept(request, { signal: controller.signal })).toEqual(next);
  expect(add).toHaveBeenCalledTimes(1); expect(remove.mock.calls[0]![1]).toBe(add.mock.calls[0]![1]);
  expect((await session.accept({ jobId: next.jobId, stepToken: next.stepToken, candidateText: JSON.stringify(data()) })).kind).toBe("result");
});

it.each([false, true])("cancels an active step and its duplicate waiters (already=%s)", async already => {
  const { session, prepared } = bridgeSetup();
  const controller = new AbortController();
  if (already) controller.abort();
  const request = { jobId: prepared.jobId, stepToken: prepared.stepToken, candidateText: JSON.stringify(core()) };
  const first = session.accept(request, { signal: controller.signal });
  const duplicate = already ? first : session.accept(request);
  if (!already) controller.abort();
  expect(await first).toMatchObject({ kind: "error", error: { code: "MODEL_ABORTED" } });
  expect(await duplicate).toEqual(await first);
  expect(session.prepare({ instance: "orders", input: "next", fields: [] }).kind).toBe("task");
});

it("retains partialResult on cancelled data validation without resurrecting the job", async () => {
  const { session, prepared } = bridgeSetup();
  const next = task(await session.accept({ jobId: prepared.jobId, stepToken: prepared.stepToken, candidateText: JSON.stringify(core()) }));
  const controller = new AbortController();
  const pending = session.accept({ jobId: next.jobId, stepToken: next.stepToken, candidateText: JSON.stringify(data()) }, { signal: controller.signal });
  controller.abort();
  expect(await pending).toMatchObject({ kind: "error", error: { code: "MODEL_ABORTED", stage: "data", partialResult: { data: {} } } });
  expect(session.prepare({ instance: "orders", input: "next", fields: [] }).kind).toBe("task");
});
