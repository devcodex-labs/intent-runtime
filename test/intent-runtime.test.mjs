import assert from "node:assert/strict";
import test from "node:test";
import {
  assertValidIntentRecord,
  createIntentRecord,
  normalizeIntentRecord,
  parseIntent,
  validateIntentRecord
} from "../dist/index.js";

const fixedNow = () => new Date("2026-09-29T00:00:00.000Z");
const fixedId = () => "intent_test";

test("parseIntent creates a valid natural-language record", () => {
  const record = parseIntent("创建 intent-runtime 仓库", {
    now: fixedNow,
    idFactory: fixedId
  });

  assert.equal(record.intentId, "intent_test");
  assert.equal(record.action, "create");
  assert.equal(record.source.kind, "natural-language");
  assert.equal(record.createdAt, "2026-09-29T00:00:00.000Z");
  assert.equal(validateIntentRecord(record).valid, true);
});

test("createIntentRecord accepts external payloads", () => {
  const record = createIntentRecord({ event: "release" }, {
    now: fixedNow,
    idFactory: fixedId
  });

  assert.equal(record.source.kind, "external-payload");
  assert.deepEqual(record.source.raw, { event: "release" });
  assertValidIntentRecord(record);
});

test("normalizeIntentRecord fills stable defaults", () => {
  const record = normalizeIntentRecord({}, {
    now: fixedNow,
    idFactory: fixedId
  });

  assert.equal(record.action, "unspecified");
  assert.equal(record.priority, "normal");
  assert.equal(record.confidence, 0.5);
  assert.equal(record.trace.length, 1);
});

test("validateIntentRecord returns issues for malformed records", () => {
  const result = validateIntentRecord({
    schemaVersion: "1.0",
    intentId: "",
    action: "create",
    summary: "x",
    source: { kind: "unknown", receivedAt: "not-a-date" },
    constraints: [],
    priority: "normal",
    confidence: 2,
    trace: [],
    metadata: {},
    createdAt: "2026-09-29T00:00:00.000Z"
  });

  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.path === "intentId"));
  assert.ok(result.issues.some((issue) => issue.path === "confidence"));
});
