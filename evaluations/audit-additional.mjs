import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { externalOutputPath } from "./output.mjs";
import { createHash } from "node:crypto";
import { loadCases } from "./cases.mjs";
import { checkExpectations } from "./expected-result.mjs";

const folder = externalOutputPath(process.argv[2]);
const read = (name) => JSON.parse(readFileSync(join(folder, name), "utf8"));
const summary = read("summary.json");
const manifest = read("manifest.json");
const events = readFileSync(join(folder, "transcript.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
assert.deepEqual(manifest, loadCases(["additional"]));
assert.equal(summary.cases, manifest.length);
assert.equal(summary.completed, manifest.length);
assert.equal(summary.reviewed, manifest.length);
assert.equal(summary.failed, 0);
assert.equal(summary.providerApiCalls, 0);
assert.ok(!events.some((event) => event.event === "controller-error"));
assert.equal(events.at(-1).event, "closed");
assert.equal(events.at(-1).childProcessExited, true);
const latest = new Map();
const hashes = new Set();
let repairTasks = 0;
let calls = 0;
for (const event of events.filter((event) => event.event === "call")) {
  calls++;
  const test = manifest.find((test) => test.key === event.key);
  assert.ok(test);
  if (event.tool === "intent_prepare") {
    assert.equal(event.arguments.input, test.input);
    assert.deepEqual(event.arguments.context, test.context);
    assert.deepEqual(event.arguments.fields, test.fields);
  } else {
    assert.equal(event.tool, "intent_accept");
    const task = latest.get(event.key);
    assert.equal(task?.kind, "task");
    assert.equal(event.arguments.jobId, task.jobId);
    assert.equal(event.arguments.stepToken, task.stepToken);
    assert.equal(event.candidateSha256, createHash("sha256").update(event.arguments.candidateText).digest("hex"));
  }
  assert.equal(event.isError, event.reply.kind === "error");
  if (event.reply.kind === "task") {
    const payload = JSON.parse(event.reply.payload);
    assert.equal(payload.currentInput, test.input);
    assert.equal(payload.structuredLanguage, test.language);
    if (payload.repair) repairTasks++;
    if (event.reply.stage === "core" && !payload.repair)
      hashes.add(createHash("sha256").update(event.reply.instructions).digest("hex"));
    if (event.reply.stage === "data")
      assert.deepEqual(payload.selectedFields, test.fields ?? Object.keys(payload.schemaReference.properties));
  }
  latest.set(event.key, event.reply);
}
assert.equal(calls, summary.toolCalls);
assert.equal(hashes.size, 1);
const records = summary.entries.map((entry) => {
  const test = manifest.find((test) => test.key === entry.key);
  assert.deepEqual(entry.final, latest.get(entry.key));
  assert.equal(entry.selfReview.independent, false);
  assert.equal(entry.independentReview, "pending");
  const result = entry.final.result ?? entry.final.error?.partialResult;
  assert.equal(result.input, test.input);
  if (!test.expectedIssue) assert.equal(entry.final.kind, "result");
  const checks = checkExpectations(test, entry.final);
  assert.deepEqual(checks.mismatches, [], entry.key);
  return { key: entry.key, ...checks };
});
const audit = {
  status: "pass", cases: records.length, toolCalls: calls, repairTasks,
  coreInstructionsSha256: [...hashes][0],
  terminalResults: summary.entries.filter((entry) => entry.final.kind === "result").length,
  expectedErrors: summary.entries.filter((entry) => entry.final.kind === "error").length,
  scope: "Record integrity and frozen action/status/data/issue checks. Author/generator/reviewer overlap; no independent accuracy or full-meaning score.",
  providerApiCalls: 0, independentReview: "pending", productionAccuracy: null,
  records,
};
writeFileSync(join(folder, "audit.json"), JSON.stringify(audit, null, 2) + "\n");
console.log(JSON.stringify({ ...audit, records: undefined }));
