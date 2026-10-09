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
it("round trips two stages and idempotently replays the same submission", () => {
  const { session } = setup();
  const first = task(session.prepare({ instance: "orders", input: "000123" }));
  const request = {
    jobId: first.jobId,
    stepToken: first.stepToken,
    candidateText: JSON.stringify(core()),
  };
  const next = task(session.accept(request));
  expect(next.stage).toBe("data");
  expect(session.accept(request)).toEqual(next);
  expect(session.accept({ ...request, candidateText: "{}" })).toMatchObject({
    kind: "error",
    error: { code: "BRIDGE_STEP_CONFLICT" },
  });
  const last = {
    jobId: next.jobId,
    stepToken: next.stepToken,
    candidateText: JSON.stringify(data()),
  };
  const result = session.accept(last);
  expect(result).toMatchObject({
    kind: "result",
    result: { data: { orderId: "000123" } },
  });
  expect(session.accept(last)).toEqual(result);
});
it("binds jobs to connection and never accepts a forged phase token", () => {
  const { bridge, session } = setup();
  const first = task(session.prepare({ instance: "orders", input: "000123" }));
  const other = bridge.connect();
  expect(
    other.accept({
      jobId: first.jobId,
      stepToken: first.stepToken,
      candidateText: "{}",
    }),
  ).toMatchObject({ kind: "error", error: { code: "BRIDGE_JOB_NOT_FOUND" } });
  expect(
    session.accept({
      jobId: first.jobId,
      stepToken: "forged",
      candidateText: "{}",
    }),
  ).toMatchObject({ kind: "error", error: { code: "BRIDGE_STEP_CONFLICT" } });
});
it("[] skips data and unknown instances/fields fail before a job", () => {
  const { session } = setup();
  const first = task(
    session.prepare({ instance: "orders", input: "000123", fields: [] }),
  );
  expect(
    session.accept({
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
it("repairs on a fresh token; then refuses further bad candidates", () => {
  const { session } = setup();
  const first = task(session.prepare({ instance: "orders", input: "000123" }));
  const second = task(
    session.accept({
      jobId: first.jobId,
      stepToken: first.stepToken,
      candidateText: "{bad",
    }),
  );
  expect(second.stepToken).not.toBe(first.stepToken);
  expect(second.stage).toBe("core");
  expect(
    session.accept({
      jobId: second.jobId,
      stepToken: second.stepToken,
      candidateText: "{bad",
    }),
  ).toMatchObject({ kind: "error", error: { code: "MODEL_OUTPUT_INVALID" } });
});
it("data cancellation keeps the default result and maps refusal", () => {
  const { session } = setup();
  const first = task(session.prepare({ instance: "orders", input: "000123" }));
  session.accept({
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
it("expires jobs and removes terminal bodies after retention", () => {
  vi.useFakeTimers();
  const { session } = setup({ jobTtlMs: 10, replayTtlMs: 10 });
  const first = task(session.prepare({ instance: "orders", input: "000123" }));
  vi.advanceTimersByTime(11);
  expect(
    session.accept({
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
it("enforces active capacity and terminates jobs on borrowed instance disposal", () => {
  const { session, intent } = setup({ maxJobs: 1 });
  const first = task(session.prepare({ instance: "orders", input: "000123" }));
  expect(session.prepare({ instance: "orders", input: "x" })).toMatchObject({
    kind: "error",
    error: { code: "LIMIT_EXCEEDED" },
  });
  intent.dispose();
  expect(
    session.accept({
      jobId: first.jobId,
      stepToken: first.stepToken,
      candidateText: "{}",
    }),
  ).toMatchObject({ kind: "error", error: { code: "INSTANCE_DISPOSED" } });
});
it("closing bridge does not dispose borrowed Intent instances", () => {
  const { intent, bridge } = setup();
  bridge.close();
  expect(() =>
    createIntentBridge({ instances: { orders: intent } }).close(),
  ).not.toThrow();
});
it("bounds active plus terminal retained jobs and frees them on disconnect", () => {
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
it("rejects oversized retained materials before keeping a job", () => {
  const { session } = setup({ maxReplayBytes: 16 });
  expect(
    session.prepare({ instance: "orders", input: "000123" }),
  ).toMatchObject({ kind: "error", error: { code: "LIMIT_EXCEEDED" } });
  expect(
    session.prepare({ instance: "orders", input: "000123" }),
  ).toMatchObject({ kind: "error", error: { code: "LIMIT_EXCEEDED" } });
});
