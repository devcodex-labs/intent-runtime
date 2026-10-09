import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const base = "https://www.iana.org/assignments/";
function records(body) {
  return body
    .replace(/\r/g, "")
    .split("\n%%\n")
    .slice(1)
    .map((part) => {
      const result = {};
      let key;
      for (const line of part.split("\n")) {
        const match = /^([A-Za-z-]+):\s*(.*)$/.exec(line);
        if (match) {
          key = match[1];
          const value = match[2];
          if (key === "Prefix") {
            (result[key] ??= []).push(value);
          } else if (result[key] === undefined) result[key] = value;
          else if (Array.isArray(result[key])) result[key].push(value);
          else result[key] = [result[key], value];
        } else if (key && /^\s/.test(line)) {
          if (Array.isArray(result[key]))
            result[key][result[key].length - 1] += " " + line.trim();
          else result[key] += " " + line.trim();
        }
      }
      return result;
    });
}
async function load(name) {
  const source = base + name + "/" + name;
  const response = await fetch(source, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error("IANA request failed: " + response.status);
  const body = await response.text();
  if (Buffer.byteLength(body) > 4000000) throw new Error("Registry too large");
  return {
    source,
    body,
    sha256: createHash("sha256").update(body).digest("hex"),
  };
}
// Download both before changing either snapshot; normal builds never run this maintenance command.
const [subtags, extensions] = await Promise.all([
  load("language-subtag-registry"),
  load("language-tag-extensions-registry"),
]);
const fileDate = /^File-Date:\s*(\S+)/m.exec(subtags.body)?.[1];
const entries = records(subtags.body);
const identifiers = records(extensions.body).map((item) => item.Identifier);
if (
  !fileDate ||
  !entries.some((item) => item.Type === "language" && item.Subtag === "en") ||
  !identifiers.includes("u") ||
  !identifiers.includes("t")
)
  throw new Error("Unexpected registry content; no snapshot changed");
await writeFile(
  "src/language/data/iana-language-subtags.json",
  JSON.stringify({
    source: subtags.source,
    checksumBasis: "Raw UTF-8 bytes of the fetched IANA registry",
    fileDate,
    sha256: subtags.sha256,
    recordsSha256: createHash("sha256")
      .update(JSON.stringify(entries))
      .digest("hex"),
    records: entries,
  }) + "\n",
);
await writeFile(
  "src/language/data/iana-language-extensions.json",
  JSON.stringify({
    source: extensions.source,
    sha256: extensions.sha256,
    identifiers,
  }) + "\n",
);
console.log(
  "Registry snapshots updated. Review data changes and run typecheck, tests, build and smoke:package before release.",
);
