import { readFileSync } from "node:fs";
import { validateReleaseTag } from "./release-evidence.mjs";

const metadata = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
if (process.env.GITHUB_REF_TYPE !== "tag") throw new Error("Publication must run from a version tag.");
validateReleaseTag({ tag: process.env.GITHUB_REF_NAME, version: metadata.version });
console.log(`Release tag ${process.env.GITHUB_REF_NAME} matches package version ${metadata.version}.`);
