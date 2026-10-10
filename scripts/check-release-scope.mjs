import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { determineReleaseScope } from "./release-scope.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const scope = await determineReleaseScope({ root, repository: "devcodex-labs/intent-runtime", version, token: process.env.GH_TOKEN });
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `requires_review=${scope.requiresReview}\n`);
console.log(JSON.stringify(scope, null, 2));
