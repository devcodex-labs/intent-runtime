import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, relative, isAbsolute, dirname, sep } from "node:path";
const metadata = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
// A development preview cannot accidentally become a public release through a
// pushed tag. A release must replace this preview and supply reviewed evidence.
if (metadata.version.includes("-dev.")) {
  throw new Error(
    "Development preview is not release-approved. Complete docs/release.md before publishing.",
  );
}
let evidence;
const root = fileURLToPath(new URL("../", import.meta.url));
const evidencePath = resolve(process.env.INTENT_RELEASE_EVIDENCE || resolve(dirname(root.replace(/[\\/]$/, "")), "intent-runtime-results", "release-acceptance.json"));
const inside = relative(root, evidencePath);
if (!inside || (!(inside === ".." || inside.startsWith(".." + sep)) && !isAbsolute(inside))) throw new Error("Release evidence must be stored outside the repository.");
try {
  evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
} catch {
  throw new Error(
    "Missing reviewed external release evidence. Set INTENT_RELEASE_EVIDENCE; see docs/release.md.",
  );
}
for (const path of [
  "openai",
  "xai",
  "codexDesktop",
  "semantics",
  "multilingual",
  "languageRegistry",
]) {
  const record = evidence[path];
  if (
    record?.accepted !== true ||
    typeof record.reviewedBy !== "string" ||
    !record.reviewedBy.trim() ||
    typeof record.evidence !== "string" ||
    !record.evidence.trim()
  ) {
    throw new Error(`Missing accepted evidence for ${path}.`);
  }
}
console.log(
  "Release evidence gate passed; authorization and npm-release protections apply separately.",
);
