import { execFileSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";

const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const releaseTools = new Set([
  "scripts/check-release-tag.mjs", "scripts/check-release.mjs",
  "scripts/release-evidence.mjs", "scripts/release-scope.mjs",
  "scripts/check-release-scope.mjs", "scripts/smoke-release.mjs",
  "scripts/smoke-release-scope.mjs", "scripts/postinstall.mjs",
  "scripts/smoke-installation.mjs", "scripts/smoke-maintenance.mjs",
  "scripts/smoke-package.mjs", "scripts/smoke-validation.mjs",
]);
function engineeringFile(file) {
  return ["README.md", "CHANGELOG.md", "LICENSE", ".gitignore"].includes(file)
    || /^(website\/|tests\/|src\/installation\/|\.github\/workflows\/)/.test(file)
    || /^evaluations\/[^/]+\.md$/.test(file) || releaseTools.has(file);
}
function versionOnly(file, before, after) {
  try {
    for (const read of [before, after]) {
      const metadata = JSON.parse(read("package.json")), lock = JSON.parse(read("package-lock.json"));
      if (!stableVersion.test(metadata.version) || lock.version !== metadata.version
        || lock.packages?.[""]?.version !== metadata.version) return false;
    }
    const oldValue = JSON.parse(before(file)), newValue = JSON.parse(after(file));
    for (const value of [oldValue, newValue]) {
      if (!stableVersion.test(value.version)) return false;
      if (file === "package-lock.json") {
        if (value.packages?.[""]?.version !== value.version) return false;
        delete value.packages[""].version;
      }
      delete value.version;
    }
    return isDeepStrictEqual(oldValue, newValue);
  } catch { return false; }
}
export function classifyReleaseChanges({ files, before, after }) {
  const reviewFiles = files.filter(file => !engineeringFile(file)
    && !(["package.json", "package-lock.json"].includes(file) && versionOnly(file, before, after)));
  return { requiresReview: reviewFiles.length > 0, reviewFiles };
}
function compareVersions(a, b) {
  const left = a.split(".").map(BigInt), right = b.split(".").map(BigInt);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
  return 0;
}
export async function determineReleaseScope({ root, repository, version, token, fetchImpl = fetch }) {
  const git = args => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const commit = git(["rev-parse", "HEAD"]).trim();
  try {
    if (!stableVersion.test(version)) throw new Error("Candidate version must be stable SemVer.");
    const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    const response = await fetchImpl(`https://api.github.com/repos/${repository}/releases?per_page=100`, { headers, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("Cannot confirm published release baseline.");
    const releases = await response.json();
    if (!Array.isArray(releases)) throw new Error("Invalid published release list.");
    const tags = releases.filter(release => release.draft === false && release.prerelease === false
      && typeof release.published_at === "string" && Number.isFinite(Date.parse(release.published_at))
      && typeof release.tag_name === "string" && release.tag_name.startsWith("v")
      && stableVersion.test(release.tag_name.slice(1)) && compareVersions(release.tag_name.slice(1), version) < 0)
      .map(release => release.tag_name).sort((a, b) => compareVersions(b.slice(1), a.slice(1)));
    let baseTag, baseCommit;
    for (const tag of tags) {
      try {
        const ref = git(["rev-parse", "--verify", `${tag}^{commit}`]).trim();
        git(["merge-base", "--is-ancestor", ref, commit]);
        if (JSON.parse(git(["show", `${ref}:package.json`])).version !== tag.slice(1)) continue;
        baseTag = tag; baseCommit = ref; break;
      } catch { /* Missing, divergent or inconsistent release refs cannot establish a baseline. */ }
    }
    if (!baseCommit) throw new Error("No reachable published stable release baseline.");
    // Disable rename detection so moving runtime code into a documentation path
    // still includes the original runtime path in the cumulative difference.
    const files = git(["diff", "--no-ext-diff", "--no-textconv", "--no-renames", "--name-only", "-z", baseCommit, commit, "--"]).split("\0").filter(Boolean);
    const scope = classifyReleaseChanges({ files, before: file => git(["show", `${baseCommit}:${file}`]), after: file => git(["show", `${commit}:${file}`]) });
    return { ...scope, baseTag, baseCommit, commit, files };
  } catch (error) {
    return { requiresReview: true, reviewFiles: [], commit, reason: error.message };
  }
}
