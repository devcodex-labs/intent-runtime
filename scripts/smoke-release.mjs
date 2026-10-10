import assert from "node:assert/strict";
import { validateReleaseEvidence, validateReleaseTag, verifyReleaseCi } from "./release-evidence.mjs";
import { loadCases } from "../evaluations/cases.mjs";
const now = Date.parse("2026-10-09T00:00:00Z"), commit = "a".repeat(40);
const expected = { repository: "devcodex-labs/intent-runtime", commit, version: "1.0.0", hashes: { prompt: "b".repeat(64) }, caseKeys: { semantics: loadCases(["semantics", "additional"]).map(test => test.key), multilingual: loadCases(["languages"]).map(test => test.key) }, registryDate: "2025-08-25", now };
const evidence = { schemaVersion: 1, repository: expected.repository, commit, version: expected.version, ciRunId: 1, hashes: expected.hashes, reviews: {} };
for (const name of ["openai", "xai", "codexCli", "codexDesktop", "semantics", "multilingual", "languageRegistry"])
  evidence.reviews[name] = { accepted: true, reviewedBy: "Test fixture", reviewedAt: "2026-10-08T00:00:00Z", evidence: "fixture://no-real-test", model: "fixture", apiCalls: 1, clientVersion: "fixture", os: "fixture", reviewedCaseKeys: expected.caseKeys[name], accuracy: 1, minimumAccuracy: 0.9, criticalFailures: 0, fileDate: "2025-08-25", freshnessDecision: "fixture" };
validateReleaseEvidence(evidence, expected);
let rejected = 0;
validateReleaseTag({ tag: "v1.0.0", version: "1.0.0" });
for (const invalid of [
  { tag: "v1.0.1", version: "1.0.0" },
  { tag: "1.0.0", version: "1.0.0" },
  { tag: "v1.0.0-dev.0", version: "1.0.0-dev.0" },
  { tag: "v1.00.0", version: "1.00.0" },
  { tag: "vnext", version: "1.0.0" },
]) {
  assert.throws(() => validateReleaseTag(invalid)); rejected++;
}
for (const mutate of [e => e.commit = "c".repeat(40), e => e.version = "1.0.1", e => e.hashes.prompt = "changed", e => e.reviews.openai.apiCalls = 0, e => e.reviews.codexCli.os = "", e => e.reviews.semantics.reviewedCaseKeys = [], e => e.reviews.multilingual.criticalFailures = 1, e => e.reviews.languageRegistry.reviewedAt = "2025-01-01", e => delete e.reviews.codexDesktop]) {
  const changed = structuredClone(evidence); mutate(changed);
  assert.throws(() => validateReleaseEvidence(changed, expected)); rejected++;
}
// Review the exact same expanded keys used by the evaluator. Dropping one
// variant must fail even when another variant of the parent case was reviewed.
const variants = expected.caseKeys.semantics.filter(key => key.startsWith("S-62/"));
assert.ok(variants.length > 1, "Regression fixture must contain sibling variants");
for (const mutate of [
  e => e.reviews.semantics.reviewedCaseKeys = e.reviews.semantics.reviewedCaseKeys.filter(key => key !== variants[0]),
  e => e.reviews.semantics.reviewedCaseKeys = [...new Set(e.reviews.semantics.reviewedCaseKeys.map(key => key.split("/")[0]))],
  e => e.reviews.semantics.reviewedCaseKeys[0] = e.reviews.semantics.reviewedCaseKeys[1],
  e => e.reviews.multilingual.reviewedCaseKeys.pop(),
]) {
  const changed = structuredClone(evidence); mutate(changed);
  assert.throws(() => validateReleaseEvidence(changed, expected)); rejected++;
}
assert.throws(() => validateReleaseEvidence(evidence, { ...expected, version: "1.0.0-dev.0" })); rejected++;
const run = { head_sha: commit, path: ".github/workflows/ci.yml", head_branch: "main", event: "push", status: "completed", conclusion: "success" };
const jobs = [{ name: "quality", conclusion: "success", steps: ["npm run typecheck", "npm run lint", "npm run smoke:release"].map(check => ({ name: `Run ${check}`, conclusion: "success" })) }, ...["ubuntu-latest", "windows-latest", "macos-latest"].flatMap(os => ["20.0.0", "24.x"].map(node => ({ name: `test (${os}, ${node})`, conclusion: "success", steps: ["npm test", "npm run build", "npm run smoke:validation", "npm run smoke:release", "node evaluations/mcp-protocol.mjs", "npm run smoke:package", "npm run smoke:installation", "npm run smoke:maintenance"].map(check => ({ name: `Run ${check}`, conclusion: "success" })) })))];
const verify = (record = run, records = jobs) => verifyReleaseCi({ repository: expected.repository, commit, runId: 1, fetchImpl: async url => new Response(JSON.stringify(url.includes("/jobs?") ? { jobs: records } : record), { headers: { "content-type": "application/json" } }) });
await verify();
await assert.rejects(verify({ ...run, head_sha: "wrong" })); rejected++;
await assert.rejects(verify(run, jobs.slice(0, -1))); rejected++;
const skipped = structuredClone(jobs); skipped[1].steps[2].conclusion = "skipped";
await assert.rejects(verify(run, skipped)); rejected++;
console.log(`Release evidence contract: ${expected.caseKeys.semantics.length} semantic variants and ${expected.caseKeys.multilingual.length} multilingual cases accepted; ${rejected} invalid cases rejected. This performs no release acceptance or publication.`);
