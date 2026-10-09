import assert from "node:assert/strict";
import { validateReleaseEvidence, verifyReleaseCi } from "./release-evidence.mjs";
const now = Date.parse("2026-10-09T00:00:00Z"), commit = "a".repeat(40);
const expected = { repository: "devcodex-labs/intent-runtime", commit, version: "1.0.0", hashes: { prompt: "b".repeat(64) }, caseIds: { semantics: ["s1"], multilingual: ["l1"] }, registryDate: "2025-08-25", now };
const evidence = { schemaVersion: 1, repository: expected.repository, commit, version: expected.version, ciRunId: 1, hashes: expected.hashes, reviews: {} };
for (const name of ["openai", "xai", "codexCli", "codexDesktop", "semantics", "multilingual", "languageRegistry"])
  evidence.reviews[name] = { accepted: true, reviewedBy: "Test fixture", reviewedAt: "2026-10-08T00:00:00Z", evidence: "fixture://no-real-test", model: "fixture", apiCalls: 1, clientVersion: "fixture", os: "fixture", reviewedCaseIds: expected.caseIds[name], accuracy: 1, minimumAccuracy: 0.9, criticalFailures: 0, fileDate: "2025-08-25", freshnessDecision: "fixture" };
validateReleaseEvidence(evidence, expected);
let rejected = 0;
for (const mutate of [e => e.commit = "c".repeat(40), e => e.version = "1.0.1", e => e.hashes.prompt = "changed", e => e.reviews.openai.apiCalls = 0, e => e.reviews.codexCli.os = "", e => e.reviews.semantics.reviewedCaseIds = [], e => e.reviews.multilingual.criticalFailures = 1, e => e.reviews.languageRegistry.reviewedAt = "2025-01-01", e => delete e.reviews.codexDesktop]) {
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
console.log(`Release evidence contract: valid fixtures accepted; ${rejected} invalid cases rejected. This performs no release acceptance or publication.`);
