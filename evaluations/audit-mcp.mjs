import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { loadCases } from "./cases.mjs";

const folder = resolve(process.argv[2]);
const summary = JSON.parse(readFileSync(join(folder, "summary.json"), "utf8"));
const events = readFileSync(join(folder, "transcript.jsonl"), "utf8")
  .trim()
  .split("\n")
  .map(JSON.parse);
const manifest = loadCases();
const state = new Map();
let assertions = 0;
function check(value, message) {
  assert.ok(value, message);
  assertions++;
}
function equal(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  assertions++;
}
equal(summary.cases, 95);
equal(summary.completed, 95);
equal(summary.reviewed, 95);
equal(summary.failed, 0);
equal(
  summary.entries.map((x) => x.key),
  manifest.map((x) => x.key),
);
check(!events.some((e) => e.event === "controller-error"), "Controller errors");
check(
  events.at(-1).event === "closed" && events.at(-1).childProcessExited,
  "Child process cleanup",
);
const dataErrors = {
  "S-41/default": "DATA_CARDINALITY_MISMATCH",
  "S-45/default": "DATA_REQUIRED_MISSING",
  "S-65/default": "DATA_REQUIRED_MISSING",
  "S-66/default": "DATA_CARDINALITY_MISMATCH",
  "S-76/default": "DATA_DEPENDENCY_MISSING",
};
for (const event of events.filter((e) => e.event === "call")) {
  const entry = summary.entries.find((x) => x.key === event.key);
  check(entry, "Manifest entry");
  const previous = state.get(event.key);
  if (event.tool === "intent_prepare")
    equal(event.arguments.input, entry.test.input, "Exact submitted input");
  else {
    check(previous?.kind === "task", "Accept must follow an actual task");
    equal(event.arguments.jobId, previous.jobId, "Actual job id");
    equal(event.arguments.stepToken, previous.stepToken, "Actual step token");
    equal(
      event.candidateSha256,
      createHash("sha256").update(event.arguments.candidateText).digest("hex"),
      "Candidate digest",
    );
  }
  const reply = event.reply;
  equal(event.isError, reply.kind === "error");
  if (reply.kind === "task") {
    const payload = JSON.parse(reply.payload);
    equal(payload.currentInput, entry.test.input);
    equal(payload.structuredLanguage, entry.test.language);
    if (reply.stage === "core") {
      check(
        !Object.hasOwn(payload, "selectedFields"),
        "Core independent of selected fields",
      );
      check(!Object.hasOwn(payload, "selectedSchema"), "Core full schema");
    } else
      equal(
        payload.selectedFields,
        entry.test.fields === undefined
          ? Object.keys(entry.schema.properties)
          : [...new Set(entry.test.fields)],
      );
  }
  state.set(event.key, reply);
}
for (const entry of summary.entries) {
  check(
    entry.executed && entry.completed && entry.selfReview.status === "pass",
    entry.key,
  );
  equal(entry.selfReview.independent, false);
  equal(entry.independentReview, "pending");
  const reply = entry.final;
  if (entry.test.expectedError)
    equal(reply.error.code, entry.test.expectedError);
  else if (dataErrors[entry.key]) {
    equal(reply.error.code, "DATA_EXTRACTION_FAILED");
    check(reply.error.issues.some((x) => x.code === dataErrors[entry.key]));
    equal(reply.error.partialResult.data, {});
  } else equal(reply.kind, "result", entry.key);
  const result =
    reply.kind === "result" ? reply.result : reply.error.partialResult;
  if (!result) continue;
  equal(
    Object.keys(result).sort(),
    [
      "input",
      "normalizedInput",
      "primaryIntent",
      "requirements",
      "prohibitions",
      "intents",
      "data",
    ].sort(),
  );
  equal(result.input, entry.test.input, "Exact final input");
  equal(
    result.intents.map((i) => i.id),
    result.intents.map((_, i) => "i" + (i + 1)),
  );
  for (const intent of result.intents) {
    check(
      [
        "ready",
        "needs_clarification",
        "awaiting_confirmation",
        "conditional",
      ].includes(intent.status),
    );
    if (intent.status === "needs_clarification")
      check(intent.clarification.length > 0 && Boolean(intent.reason));
    if (intent.status === "ready")
      check(
        !Object.hasOwn(intent, "reason") &&
          !Object.hasOwn(intent, "clarification"),
      );
  }
  check(
    Object.keys(result.data).every((name) =>
      (
        entry.test.fields ?? Object.keys(entry.schema?.properties ?? {})
      ).includes(name),
    ),
    "No unselected fields",
  );
  if (entry.test.fields?.length === 0) {
    equal(result.data, {});
    check(
      !events.some(
        (e) =>
          e.key === entry.key &&
          e.reply?.kind === "task" &&
          e.reply.stage === "data",
      ),
      "Empty selection skips data task",
    );
  }
}
const result = (key) => summary.entries.find((x) => x.key === key).final.result;
const withoutData = (key) => {
  const { data, ...core } = result(key);
  return core;
};
equal(withoutData("S-77/all"), withoutData("S-77/partial"));
equal(withoutData("S-77/all"), withoutData("S-77/empty"));
equal(result("S-40/default").data, {
  orders: [
    { orderId: "A", operation: "cancel" },
    { orderId: "B", operation: "query" },
  ],
});
equal(result("S-44/duplicate").data, { orderId: "000123" });
for (const key of [
  "S-08/default",
  "S-09/default",
  "S-54/default",
  "S-63/default",
  "S-64/reporting",
])
  equal(result(key).intents, []);
equal(
  result("S-21/default").intents.map((i) => [i.action, i.target]),
  [["delete", "B"]],
);
equal(
  result("S-23/default").intents.map((i) => i.action),
  ["query"],
);
equal(
  result("S-55/default").intents.map((i) => i.action),
  ["generate"],
);
equal(
  result("S-56/default").intents.map((i) => i.action),
  ["execute", "modify", "execute"],
);
equal(
  result("S-71/default").intents.map((i) => i.action),
  ["generate", "execute"],
);
equal(
  result("S-81/default").intents.map((i) => [i.action, i.status]),
  [
    ["generate", "conditional"],
    ["query", "conditional"],
  ],
);
for (let i = 1; i <= 6; i++) {
  const r = result("L-" + i + "/default");
  const text = JSON.stringify(r);
  for (const token of ["order-service", "000123", "Release Notes"])
    check(text.includes(token), "Exact language-case token");
  equal(r.input, manifest.find((x) => x.key === "L-" + i + "/default").input);
}
const audit = {
  status: "pass",
  assertions,
  cases: 95,
  terminalResults: summary.entries.filter((x) => x.final.kind === "result")
    .length,
  expectedErrors: summary.entries.filter((x) => x.final.kind === "error")
    .length,
  toolCalls: summary.toolCalls,
  scope:
    "Record integrity and deterministic contract checks; does not replace independent semantic evaluation",
};
writeFileSync(
  join(folder, "audit.json"),
  JSON.stringify(audit, null, 2) + "\n",
);
console.log(JSON.stringify(audit));
