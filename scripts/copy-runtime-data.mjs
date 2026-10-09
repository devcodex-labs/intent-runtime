import { mkdir, copyFile, chmod } from "node:fs/promises";
await mkdir("dist/language/data", { recursive: true });
for (const name of [
  "iana-language-subtags.json",
  "iana-language-extensions.json",
])
  await copyFile("src/language/data/" + name, "dist/language/data/" + name);
await chmod("dist/transports/mcp/main.js", 0o755);
await chmod("dist/installation/cli.js", 0o755);
await mkdir("dist/schema", { recursive: true });
await copyFile("src/schema/validation-worker.mjs", "dist/schema/validation-worker.mjs");
