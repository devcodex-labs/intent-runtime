import { readFileSync } from "node:fs";
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
try {
  evidence = JSON.parse(
    readFileSync(
      new URL("../evaluations/release-acceptance.json", import.meta.url),
      "utf8",
    ),
  );
} catch {
  throw new Error(
    "Missing reviewed evaluations/release-acceptance.json; see docs/release.md.",
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
