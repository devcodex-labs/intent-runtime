import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { classifyReleaseChanges, determineReleaseScope } from "./release-scope.mjs";

let checks = 0;
function expectScope(files, required, before = () => undefined, after = () => undefined) {
  assert.equal(classifyReleaseChanges({ files, before, after }).requiresReview, required); checks++;
}
expectScope([], false);
expectScope(["README.md", "website/content/api/response.md", "src/installation/toml.ts", "scripts/postinstall.mjs", "tests/installation.test.ts", ".github/workflows/publish.yml", "scripts/release-scope.mjs", "evaluations/review-guidance.md"], false);
for (const file of ["src/intent.ts", "src/contracts/public.ts", "src/core/pipeline.ts", "src/bridge/index.ts", "src/transports/mcp/main.ts", "src/prompts/tasks.ts", "src/language/data/iana-language-subtags.json", "src/adapters/api/index.ts", "src/schema/schema.ts", "integrations/codex/workflow.md", "evaluations/cases/semantics.jsonl", "scripts/copy-runtime-data.mjs", "tsconfig.build.json", "unknown.txt"])
  expectScope(["README.md", file], true);
const pkg = { name: "@devcodex/intent-runtime", version: "1.0.0", dependencies: { example: "1" }, scripts: { build: "tsc" }, exports: { ".": "./dist/index.js" } };
const lock = { version: "1.0.0", lockfileVersion: 3, packages: { "": { name: pkg.name, version: "1.0.0", dependencies: pkg.dependencies }, "node_modules/example": { version: "1", integrity: "original" } } };
for (const [file, original] of [["package.json", pkg], ["package-lock.json", lock]]) {
  const updated = structuredClone(original); updated.version = "1.0.1";
  if (file === "package-lock.json") updated.packages[""].version = updated.version;
  const updatedPkg = { ...pkg, version: "1.0.1" }, updatedLock = structuredClone(lock);
  updatedLock.version = updatedLock.packages[""].version = "1.0.1";
  const before = name => JSON.stringify(name === file ? original : name === "package.json" ? pkg : lock);
  const after = name => JSON.stringify(name === file ? updated : name === "package.json" ? updatedPkg : updatedLock, null, 2);
  expectScope([file], false, before, after);
  expectScope([file], true, before, () => undefined);
  expectScope([file], true, () => undefined, () => JSON.stringify(updated));
  expectScope([file], true, before, () => "invalid JSON");
  const changed = structuredClone(updated);
  if (file === "package.json") changed.dependencies.example = "2";
  else changed.packages["node_modules/example"].integrity = "changed";
  expectScope([file], true, before, name => name === file ? JSON.stringify(changed) : after(name));
  expectScope([file], true, before, name => name === file ? JSON.stringify(updated) : JSON.stringify(name === "package.json" ? pkg : lock));
}
for (const mutate of [value => value.scripts.build = "custom build", value => value.exports["."] = "./dist/other.js", value => value.engines = { node: ">=24" }]) {
  const changed = structuredClone(pkg); mutate(changed);
  expectScope(["package.json"], true, name => JSON.stringify(name === "package.json" ? pkg : lock), name => JSON.stringify(name === "package.json" ? changed : lock));
}
const inconsistentLock = structuredClone(lock); inconsistentLock.version = "1.0.1";
expectScope(["package-lock.json"], true, () => JSON.stringify(lock), () => JSON.stringify(inconsistentLock));

const root = mkdtempSync(join(tmpdir(), "intent-release-scope-"));
const git = args => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const write = (file, content) => { mkdirSync(dirname(join(root, file)), { recursive: true }); writeFileSync(join(root, file), content); };
const commit = () => { git(["add", "."]); git(["-c", "user.name=Scope fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "scope fixture"]); };
const published = { tag_name: "v1.0.0", draft: false, prerelease: false, published_at: "2026-10-10T00:00:00Z" };
const fetchReleases = releases => async () => new Response(JSON.stringify(releases), { headers: { "content-type": "application/json" } });
const detect = (releases = [published]) => determineReleaseScope({ root, repository: "fixture/repository", version: "1.0.2", fetchImpl: fetchReleases(releases) });
try {
  git(["init", "-q"]);
  write("package.json", JSON.stringify({ name: pkg.name, version: "1.0.0" }));
  write("package-lock.json", JSON.stringify({ version: "1.0.0", packages: { "": { version: "1.0.0" } } }));
  write("src/core/pipeline.ts", "original runtime\n");
  write("README.md", "original docs\n");
  commit(); git(["tag", "v1.0.0"]);
  write("package.json", JSON.stringify({ name: pkg.name, version: "1.0.2" }));
  write("package-lock.json", JSON.stringify({ version: "1.0.2", packages: { "": { version: "1.0.2" } } }));
  write("README.md", "updated docs\n"); commit();
  const engineering = await detect();
  assert.equal(engineering.baseTag, "v1.0.0"); assert.equal(engineering.requiresReview, false); checks++;
  write("src/core/pipeline.ts", "changed runtime\n"); commit(); git(["tag", "v1.0.1"]);
  write("README.md", "another docs update\n"); commit();
  const cumulative = await detect();
  assert.equal(cumulative.baseTag, "v1.0.0"); assert.equal(cumulative.requiresReview, true);
  assert.ok(cumulative.reviewFiles.includes("src/core/pipeline.ts")); checks++;
  const draft = await detect([published, { ...published, tag_name: "v1.0.1", draft: true }]);
  assert.equal(draft.baseTag, "v1.0.0"); assert.equal(draft.requiresReview, true); checks++;
  const prerelease = await detect([published, { ...published, tag_name: "v1.0.1", prerelease: true }]);
  assert.equal(prerelease.baseTag, "v1.0.0"); assert.equal(prerelease.requiresReview, true); checks++;
  const inconsistent = await detect([published, { ...published, tag_name: "v1.0.1" }]);
  assert.equal(inconsistent.baseTag, "v1.0.0"); assert.equal(inconsistent.requiresReview, true); checks++;
  mkdirSync(join(root, "website/content"), { recursive: true });
  git(["mv", "src/core/pipeline.ts", "website/content/moved.md"]); commit();
  const renamed = await detect();
  assert.equal(renamed.requiresReview, true); assert.ok(renamed.reviewFiles.includes("src/core/pipeline.ts")); checks++;
  write("package.json", JSON.stringify({ name: pkg.name, version: "1.0.1" }));
  write("package-lock.json", JSON.stringify({ version: "1.0.1", packages: { "": { version: "1.0.1" } } }));
  git(["add", "."]);
  const unrelated = git(["-c", "user.name=Scope fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit-tree", git(["write-tree"]).trim(), "-m", "unrelated fixture"]).trim();
  git(["tag", "-d", "v1.0.1"]); git(["tag", "v1.0.1", unrelated]);
  const divergent = await detect([published, { ...published, tag_name: "v1.0.1" }]);
  assert.equal(divergent.baseTag, "v1.0.0"); assert.equal(divergent.requiresReview, true); checks++;
  for (const releases of [[], [{ ...published, tag_name: "v0.9.0" }]]) {
    const missing = await detect(releases);
    assert.equal(missing.requiresReview, true); assert.ok(missing.reason); checks++;
  }
  const unavailable = await determineReleaseScope({ root, repository: "fixture/repository", version: "1.0.2", fetchImpl: async () => new Response("", { status: 403 }) });
  assert.equal(unavailable.requiresReview, true); assert.ok(unavailable.reason); checks++;
  const malformed = await determineReleaseScope({ root, repository: "fixture/repository", version: "1.0.2", fetchImpl: async () => new Response("not JSON") });
  assert.equal(malformed.requiresReview, true); assert.ok(malformed.reason); checks++;
} finally { rmSync(root, { recursive: true, force: true }); }
console.log(`Release scope: ${checks} checks passed, including cumulative changes, published baselines, metadata/dependency boundaries and runtime renames. No real-model acceptance or publication performed.`);
