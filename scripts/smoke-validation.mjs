import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { Intent } from "../dist/index.js";
import { createIntentBridge } from "../dist/bridge/index.js";
const core = { normalizedInput: "Check the supplied identifier.", primaryIntent: null, requirements: [], prohibitions: [], intents: [] };
const candidate = value => ({ data: { value }, evidence: [{ path: "/data/value", mode: "exact", sources: [{ sourceId: "input", quote: value }] }], descriptionChecks: [], fieldResults: [{ path: "/data/value", status: "extracted", explanation: "Explicit value" }], issues: [] });
const schema = { type: "object", properties: { value: { type: "string", pattern: "^(a+)+$" } } };
if (process.argv.includes("--child")) {
  const intent = new Intent({ schema, repairAttempts: 0, limits: { maxValidationMs: 1200 } });
  const bridge = createIntentBridge({ instances: { test: intent }, maxJobs: 2 }), session = bridge.connect();
  const task = reply => { assert.equal(reply.kind, "task"); return reply; };
  const accept = (reply, value) => session.accept({ jobId: reply.jobId, stepToken: reply.stepToken, candidateText: JSON.stringify(value) });
  async function prepare(value) {
    return task(await accept(task(session.prepare({ instance: "test", input: value })), core));
  }
  try {
    const warm = await prepare("a");
    assert.equal((await accept(warm, candidate("a"))).kind, "result");
    const bad = await prepare("a".repeat(32) + "!");
    let ticks = 0;
    const heartbeat = setInterval(() => ticks++, 10);
    const started = performance.now();
    let result;
    try {
      const pending = accept(bad, candidate("a".repeat(32) + "!"));
      await delay(100); // The worker is executing a catastrophic backtracking pattern.
      const unrelated = task(session.prepare({ instance: "test", input: "thanks", fields: [] }));
      assert.equal((await accept(unrelated, core)).kind, "result");
      assert.equal((await accept(await prepare("aa"), candidate("aa"))).kind, "result");
      result = await pending;
    } finally { clearInterval(heartbeat); }
    assert.equal(result.kind, "error");
    assert.equal(result.error.code, "LIMIT_EXCEEDED");
    assert.deepEqual(result.error.partialResult.data, {});
    assert.ok(ticks >= 20, "Parent event loop must continue while the regex worker is busy");
    assert.ok(performance.now() - started < 4000, "Validation budget must terminate a blocked worker");
    assert.equal((await accept(await prepare("aaa"), candidate("aaa"))).kind, "result");
    const cancelled = await prepare("a".repeat(32) + "!");
    const pending = accept(cancelled, candidate("a".repeat(32) + "!"));
    await delay(100);
    const cancellation = session.cancel({ jobId: cancelled.jobId });
    assert.equal(cancellation.error.code, "MODEL_ABORTED");
    assert.deepEqual(await pending, cancellation);
    assert.equal((await accept(await prepare("a"), candidate("a"))).kind, "result");
    process.send?.({ status: "pass", node: process.version, heartbeatTicks: ticks, providerApiCalls: 0 });
  } finally { bridge.close(); intent.dispose(); }
} else {
  // A regression to synchronous validation must fail safely: the parent can
  // terminate this exact child even if its event loop cannot run any timer.
  await new Promise((resolve, reject) => {
    const child = fork(fileURLToPath(import.meta.url), ["--child"], { stdio: ["ignore", "inherit", "inherit", "ipc"], execArgv: [] });
    let passed = false;
    const watchdog = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Validation child exceeded its hard watchdog deadline.")); }, 10000);
    child.on("message", message => { passed = message?.status === "pass"; if (passed) console.log(JSON.stringify(message)); });
    child.once("error", error => { clearTimeout(watchdog); reject(error); });
    child.once("exit", code => { clearTimeout(watchdog); if (code === 0 && passed) resolve(); else reject(new Error(`Validation child failed (exit ${code}).`)); });
  });
}
