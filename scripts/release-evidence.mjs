import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
export const RELEASE_INPUTS = [
  "src/prompts/tasks.ts", "evaluations/cases/semantics.jsonl", "evaluations/cases/languages.jsonl", "evaluations/cases/additional.jsonl", "evaluations/schemas.mjs", "evaluations/expected-result.mjs", "src/language/data/iana-language-subtags.json", "src/language/data/iana-language-extensions.json",
];
export function releaseHashes(root) {
  return Object.fromEntries(RELEASE_INPUTS.map(file => [file, createHash("sha256").update(readFileSync(join(root, file))).digest("hex")]));
}
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
const text = value => typeof value === "string" && value.trim().length > 0;
export function validateReleaseTag({ tag, version }) {
  const stable = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
  requireValue(stable.test(version), "Release package version must be stable SemVer.");
  requireValue(tag === `v${version}`, "Release tag must match the package version exactly.");
}
export function validateReleaseEvidence(evidence, { repository, commit, version, hashes, caseKeys, registryDate, now = Date.now() }) {
  validateReleaseTag({ tag: `v${version}`, version });
  requireValue(evidence?.schemaVersion === 1 && evidence.repository === repository && evidence.commit === commit && evidence.version === version, "Release evidence does not match the repository, commit and version.");
  requireValue(/^\d+$/.test(String(evidence.ciRunId)), "Missing CI run ID.");
  for (const [file, hash] of Object.entries(hashes)) requireValue(evidence.hashes?.[file] === hash, `Release input changed: ${file}.`);
  for (const name of ["openai", "xai", "codexCli", "codexDesktop", "semantics", "multilingual", "languageRegistry"]) {
    const review = evidence.reviews?.[name], date = Date.parse(review?.reviewedAt);
    requireValue(review?.accepted === true && text(review.reviewedBy) && text(review.evidence) && Number.isFinite(date) && date <= now && now - date <= 90 * 86400000, `Missing recent accepted review for ${name}.`);
    if (name === "openai" || name === "xai") requireValue(text(review.model) && Number.isSafeInteger(review.apiCalls) && review.apiCalls > 0, `Missing actual provider execution for ${name}.`);
    if (name === "codexCli" || name === "codexDesktop") requireValue(text(review.clientVersion) && text(review.os), `Missing actual client environment for ${name}.`);
    if (name === "semantics" || name === "multilingual") {
      const required = caseKeys[name], reviewed = review.reviewedCaseKeys;
      requireValue(Array.isArray(reviewed) && new Set(reviewed).size === reviewed.length && reviewed.length === required.length && required.every(key => reviewed.includes(key)), `Incomplete case variant review for ${name}.`);
      requireValue(Number.isFinite(review.accuracy) && review.accuracy >= 0 && review.accuracy <= 1 && Number.isFinite(review.minimumAccuracy) && review.minimumAccuracy > 0 && review.minimumAccuracy <= 1 && review.accuracy >= review.minimumAccuracy && review.criticalFailures === 0, `Quality acceptance failed for ${name}.`);
    }
    if (name === "languageRegistry") requireValue(review.fileDate === registryDate && text(review.freshnessDecision), "Missing language registry freshness decision for the shipped snapshot.");
  }
}
export async function verifyReleaseCi({ repository, commit, runId, token, fetchImpl = fetch }) {
  const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  async function read(path) {
    const response = await fetchImpl(`https://api.github.com/repos/${repository}/actions/${path}`, { headers, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("Cannot verify release CI evidence.");
    return response.json();
  }
  const run = await read(`runs/${runId}`);
  requireValue(run.head_sha === commit && run.path === ".github/workflows/ci.yml" && run.head_branch === "main" && run.event === "push" && run.status === "completed" && run.conclusion === "success", "CI evidence must be a successful main-branch CI run for this exact commit.");
  const { jobs } = await read(`runs/${runId}/jobs?per_page=100&filter=latest`);
  const names = ["quality", ...["ubuntu-latest", "windows-latest", "macos-latest"].flatMap(os => ["20.0.0", "24.x"].map(node => `test (${os}, ${node})`))];
  for (const name of names) {
    const job = jobs?.find(job => job.name === name);
    requireValue(job?.conclusion === "success", `Missing successful platform job: ${name}.`);
    const checks = name === "quality" ? ["npm run typecheck", "npm run lint", "npm run smoke:release"] : ["npm test", "npm run build", "npm run smoke:validation", "npm run smoke:release", "node evaluations/mcp-protocol.mjs", "npm run smoke:package", "npm run smoke:installation", "npm run smoke:maintenance"];
    for (const check of checks) requireValue(job.steps?.some(step => step.name === `Run ${check}` && step.conclusion === "success"), `Missing successful check ${check} in ${name}.`);
  }
}
