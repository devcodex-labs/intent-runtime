import { afterEach, expect, it, vi } from "vitest";
import { Intent } from "../src/index.js";
import { createIntentBridge } from "../src/bridge/index.js";
import type { BridgeReply } from "../src/bridge/index.js";
import { core, data, orderSchema } from "./fixtures.js";
const closers: (() => void)[] = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
  vi.useRealTimers();
});
function setup(options = {}) {
  const intent = new Intent({ schema: orderSchema });
  const bridge = createIntentBridge({
    instances: { orders: intent },
    ...options,
  });
  const session = bridge.connect();
  closers.push(() => {
    bridge.close();
    intent.dispose();
  });
  return { intent, bridge, session };
}
function task(reply: BridgeReply) {
  expect(reply.kind).toBe("task");
  if (reply.kind !== "task") throw new Error("Expected task");
  return reply;
}
it("snapshots an asynchronous submission before the caller can mutate its request", async () => {
  const { session } = setup();
  const first = task(session.prepare({ instance: "orders", input: "x", fields: [] }));
  const request = { jobId: first.jobId, stepToken: first.stepToken, candidateText: JSON.stringify(core()) };
  const original = { ...request }, pending = session.accept(request);
  request.candidateText = "{}";
  request.stepToken = "mutated";
  const result = await pending;
  expect(result).toMatchObject({ kind: "result", result: { normalizedInput: "Query order 000123." } });
  expect(await session.accept(original)).toEqual(result);
});
it("shares an in-flight data submission and rejects a competing candidate", async () => {
  const { session } = setup();
  const first = task(session.prepare({ instance: "orders", input: "000123" }));
  const next = task(await session.accept({ jobId: first.jobId, stepToken: first.stepToken, candidateText: JSON.stringify(core()) }));
  const request = { jobId: next.jobId, stepToken: next.stepToken, candidateText: JSON.stringify(data()) };
  const pending = session.accept(request), duplicate = session.accept(request);
  expect(await session.accept({ ...request, candidateText: "{}" })).toMatchObject({ kind: "error", error: { code: "BRIDGE_STEP_CONFLICT" } });
  const result = await pending;
  expect(result.kind).toBe("result");
  expect(await duplicate).toEqual(result);
  expect(await session.accept(request)).toEqual(result);
});
it.each(["cancel", "close", "dispose"] as const)("does not resurrect data work after %s during validation", async operation => {
  const { session, intent, bridge } = setup({ maxJobs: 1 });
  const first = task(session.prepare({ instance: "orders", input: "000123" }));
  const next = task(await session.accept({ jobId: first.jobId, stepToken: first.stepToken, candidateText: JSON.stringify(core()) }));
  const pending = session.accept({ jobId: next.jobId, stepToken: next.stepToken, candidateText: JSON.stringify(data()) });
  await Promise.resolve(); // Enter the worker-backed data validation.
  if (operation === "cancel") session.cancel({ jobId: next.jobId });
  else if (operation === "close") session.close();
  else intent.dispose();
  expect(await pending).toMatchObject({ kind: "error", error: { code: operation === "cancel" ? "MODEL_ABORTED" : operation === "close" ? "BRIDGE_JOB_NOT_FOUND" : "INSTANCE_DISPOSED", stage: operation === "close" ? "bridge" : "data" } });
  if (operation !== "dispose") expect(bridge.connect().prepare({ instance: "orders", input: "next", fields: [] }).kind).toBe("task");
});
it("does not replay an old successful stage after configured idle expiration", async () => {
  vi.useFakeTimers({ toFake: ["Date", "performance", "setTimeout", "clearTimeout"] });
  const { session } = setup({ jobTtlMs: 100 });
  const first = task(session.prepare({ instance: "orders", input: "000123" }));
  const request = { jobId: first.jobId, stepToken: first.stepToken, candidateText: JSON.stringify(core()) };
  expect((await session.accept(request)).kind).toBe("task");
  vi.advanceTimersByTime(101);
  expect(await session.accept(request)).toMatchObject({ kind: "error", error: { code: "BRIDGE_JOB_EXPIRED", partialResult: { data: {} } } });
});
it("keeps default active sessions and completed replays across several days", async () => {
  vi.useFakeTimers({ toFake: ["Date", "performance", "setTimeout", "clearTimeout"] });
  const { session } = setup();
  const first = task(session.prepare({ instance: "orders", input: "x", fields: [] }));
  expect(first).not.toHaveProperty("expiresAt");
  vi.advanceTimersByTime(5 * 86400000);
  const request = { jobId: first.jobId, stepToken: first.stepToken, candidateText: JSON.stringify(core()) };
  const result = await session.accept(request);
  expect(result.kind).toBe("result");
  vi.advanceTimersByTime(5 * 86400000);
  expect(await session.accept(request)).toEqual(result);
});
it("evicts completed records to admit new work without evicting active jobs", async () => {
  const { session } = setup({ maxReplayEntries: 1 });
  const first = task(session.prepare({ instance: "orders", input: "x", fields: [] }));
  expect(session.prepare({ instance: "orders", input: "next", fields: [] })).toMatchObject({ kind: "error", error: { code: "LIMIT_EXCEEDED" } });
  expect((await session.accept({ jobId: first.jobId, stepToken: first.stepToken, candidateText: JSON.stringify(core()) })).kind).toBe("result");
  expect(session.prepare({ instance: "orders", input: "next", fields: [] }).kind).toBe("task");
  expect(session.cancel({ jobId: first.jobId })).toMatchObject({ kind: "error", error: { code: "BRIDGE_JOB_NOT_FOUND" } });
});
it("rejects an over-budget submission without advancing or deleting its active job", async () => {
  const { session } = setup({ maxReplayBytes: 1600 });
  const first = task(session.prepare({ instance: "orders", input: "x", fields: [] }));
  const large = core(); large.normalizedInput = "x".repeat(4000);
  expect(await session.accept({ jobId: first.jobId, stepToken: first.stepToken, candidateText: JSON.stringify(large) })).toMatchObject({ kind: "error", error: { code: "LIMIT_EXCEEDED" } });
  expect(await session.accept({ jobId: first.jobId, stepToken: first.stepToken, candidateText: JSON.stringify(core()) })).toMatchObject({ kind: "result" });
});
it("expires by deadline even when the cleanup timer cannot run", async () => {
  const { session } = setup({ jobTtlMs: 10 });
  const first = task(session.prepare({ instance: "orders", input: "x", fields: [] }));
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40);
  expect(await session.accept({ jobId: first.jobId, stepToken: first.stepToken, candidateText: JSON.stringify(core()) })).toMatchObject({ kind: "error", error: { code: "BRIDGE_JOB_EXPIRED" } });
});
it("isolates the fixed core contract from mutation of a public task Schema", async () => {
  const { session, bridge } = setup();
  const first = task(session.prepare({ instance: "orders", input: "x", fields: [] }));
  if (first.format.kind !== "json_schema") throw new Error("Expected Schema");
  const schema = first.format.schema as unknown as { properties: { intents: { items: { properties: { action: { enum: unknown[] } } } } } };
  schema.properties.intents.items.properties.action.enum.push("purchase");
  const secondSession = bridge.connect();
  const second = task(secondSession.prepare({ instance: "orders", input: "x", fields: [] }));
  expect(JSON.stringify(second.format)).not.toContain("purchase");
  const candidate = core();
  candidate.intents[0]!.action = "purchase";
  expect((await secondSession.accept({ jobId: second.jobId, stepToken: second.stepToken, candidateText: JSON.stringify(candidate) })).kind).toBe("task");
});
it("round trips two stages and idempotently replays the same submission", async () => {
  const { session } = setup();
  const first = task(session.prepare({ instance: "orders", input: "000123" }));
  const request = {
    jobId: first.jobId,
    stepToken: first.stepToken,
    candidateText: JSON.stringify(core()),
  };
  const next = task(await session.accept(request));
  expect(next.stage).toBe("data");
  expect(await session.accept(request)).toEqual(next);
  expect(await session.accept({ ...request, candidateText: "{}" })).toMatchObject({
    kind: "error",
    error: { code: "BRIDGE_STEP_CONFLICT" },
  });
  const last = {
    jobId: next.jobId,
    stepToken: next.stepToken,
    candidateText: JSON.stringify(data()),
  };
  const result = await session.accept(last);
  expect(result).toMatchObject({
    kind: "result",
    result: { data: { orderId: "000123" } },
  });
  expect(await session.accept(last)).toEqual(result);
});
it("binds jobs to connection and never accepts a forged phase token", async () => {
  const { bridge, session } = setup();
  const first = task(session.prepare({ instance: "orders", input: "000123" }));
  const other = bridge.connect();
  expect(
    await other.accept({
      jobId: first.jobId,
      stepToken: first.stepToken,
      candidateText: "{}",
    }),
  ).toMatchObject({ kind: "error", error: { code: "BRIDGE_JOB_NOT_FOUND" } });
  expect(
    await session.accept({
      jobId: first.jobId,
      stepToken: "forged",
      candidateText: "{}",
    }),
  ).toMatchObject({ kind: "error", error: { code: "BRIDGE_STEP_CONFLICT" } });
});
it("[] skips data and unknown instances/fields fail before a job", async () => {
  const { session } = setup();
  const first = task(
    session.prepare({ instance: "orders", input: "000123", fields: [] }),
  );
  expect(
    await session.accept({
      jobId: first.jobId,
      stepToken: first.stepToken,
      candidateText: JSON.stringify(core()),
    }),
  ).toMatchObject({ kind: "result", result: { data: {} } });
  expect(session.prepare({ instance: "unknown", input: "x" })).toMatchObject({
    kind: "error",
    error: { code: "INPUT_INVALID" },
  });
  expect(
    session.prepare({ instance: "orders", input: "x", fields: ["unknown"] }),
  ).toMatchObject({ kind: "error", error: { code: "UNKNOWN_FIELD" } });
});
it("repairs on a fresh token; then refuses further bad candidates", async () => {
  const { session } = setup();
  const first = task(session.prepare({ instance: "orders", input: "000123" }));
  const second = task(
    await session.accept({
      jobId: first.jobId,
      stepToken: first.stepToken,
      candidateText: "{bad",
    }),
  );
  expect(second.stepToken).not.toBe(first.stepToken);
  expect(second.stage).toBe("core");
  expect(
    await session.accept({
      jobId: second.jobId,
      stepToken: second.stepToken,
      candidateText: "{bad",
    }),
  ).toMatchObject({ kind: "error", error: { code: "MODEL_OUTPUT_INVALID" } });
});
it("data cancellation keeps the default result and maps refusal", async () => {
  const { session } = setup();
  const first = task(session.prepare({ instance: "orders", input: "000123" }));
  await session.accept({
    jobId: first.jobId,
    stepToken: first.stepToken,
    candidateText: JSON.stringify(core()),
  });
  expect(
    session.cancel({ jobId: first.jobId, outcome: "refusal" }),
  ).toMatchObject({
    kind: "error",
    error: {
      code: "MODEL_REFUSED",
      stage: "data",
      partialResult: { data: {} },
    },
  });
});
it("expires jobs and removes terminal bodies after retention", async () => {
  vi.useFakeTimers({ toFake: ["Date", "performance", "setTimeout", "clearTimeout"] });
  const { session } = setup({ jobTtlMs: 10, replayTtlMs: 10 });
  const first = task(session.prepare({ instance: "orders", input: "000123" }));
  vi.advanceTimersByTime(11);
  expect(
    await session.accept({
      jobId: first.jobId,
      stepToken: first.stepToken,
      candidateText: "{}",
    }),
  ).toMatchObject({ kind: "error", error: { code: "BRIDGE_JOB_EXPIRED" } });
  vi.advanceTimersByTime(11);
  expect(session.cancel({ jobId: first.jobId })).toMatchObject({
    kind: "error",
    error: { code: "BRIDGE_JOB_NOT_FOUND" },
  });
});
it("enforces active capacity and terminates jobs on borrowed instance disposal", async () => {
  const { session, intent } = setup({ maxJobs: 1 });
  const first = task(session.prepare({ instance: "orders", input: "000123" }));
  expect(session.prepare({ instance: "orders", input: "x" })).toMatchObject({
    kind: "error",
    error: { code: "LIMIT_EXCEEDED" },
  });
  intent.dispose();
  expect(
    await session.accept({
      jobId: first.jobId,
      stepToken: first.stepToken,
      candidateText: "{}",
    }),
  ).toMatchObject({ kind: "error", error: { code: "INSTANCE_DISPOSED" } });
});
it("closing bridge does not dispose borrowed Intent instances", async () => {
  const { intent, bridge } = setup();
  bridge.close();
  expect(() =>
    createIntentBridge({ instances: { orders: intent } }).close(),
  ).not.toThrow();
});
it("bounds active plus terminal retained jobs and frees them on disconnect", async () => {
  const { session, bridge } = setup({ maxJobs: 4, maxReplayEntries: 1 });
  session.prepare({ instance: "orders", input: "000123", fields: [] });
  expect(session.prepare({ instance: "orders", input: "x" })).toMatchObject({
    kind: "error",
    error: { code: "LIMIT_EXCEEDED" },
  });
  session.close();
  expect(
    bridge.connect().prepare({ instance: "orders", input: "x", fields: [] }),
  ).toMatchObject({ kind: "task" });
});
it("rejects oversized retained materials before keeping a job", async () => {
  const { session } = setup({ maxReplayBytes: 16 });
  expect(
    session.prepare({ instance: "orders", input: "000123" }),
  ).toMatchObject({ kind: "error", error: { code: "LIMIT_EXCEEDED" } });
  expect(
    session.prepare({ instance: "orders", input: "000123" }),
  ).toMatchObject({ kind: "error", error: { code: "LIMIT_EXCEEDED" } });
});
