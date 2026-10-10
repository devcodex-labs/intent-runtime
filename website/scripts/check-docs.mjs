import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const website = fileURLToPath(new URL("../", import.meta.url));
const root = join(website, "..");
const content = join(website, "content");
async function walk(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "public") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (/\.mdx?$/.test(entry.name)) files.push(path);
  }
  return files;
}
const files = await walk(content);
let snippets = 0;
for (const path of files) {
  const text = await readFile(path, "utf8");
  assert.match(text, /^title: .+$/m, `Missing title: ${path}`);
  assert.match(text, /^description: .+$/m, `Missing description: ${path}`);
  for (const match of text.matchAll(/```(?:js|javascript)\n([\s\S]*?)\n```/g)) {
    try { execFileSync(process.execPath, ["--input-type=module", "--check"], { input: match[1], stdio: ["pipe", "pipe", "pipe"] }); }
    catch (error) { throw new Error(`Invalid JavaScript example in ${relative(content, path)}`, { cause: error }); }
    snippets++;
  }
}
const contracts = await readFile(join(root, "src/contracts/public.ts"), "utf8");
const defaults = /DEFAULT_LIMITS[\s\S]*?Object\.freeze\(\{([\s\S]*?)\}\)/.exec(contracts)?.[1];
assert.ok(defaults, "Public defaults must be readable");
const reference = await readFile(join(content, "api/intent.md"), "utf8");
for (const [,name,value] of defaults.matchAll(/(\w+): (\d+)/g))
  assert.ok(reference.includes(`| \`${name}\` | ${value} |`), `Documented default drift: ${name}`);
const errors = await readFile(join(root, "src/errors.ts"), "utf8");
const errorPage = await readFile(join(content, "api/errors.md"), "utf8");
for (const name of ["ERROR_CODES", "DATA_ISSUE_CODES"]) {
  const values = new RegExp(`${name} = Object\\.freeze\\(\\[([\\s\\S]*?)\\]`).exec(errors)?.[1];
  assert.ok(values, name);
  for (const [,code] of values.matchAll(/"([A-Z_]+)"/g))
    assert.ok(errorPage.includes(`| \`${code}\` |`), `Undocumented code: ${code}`);
}
const config = await readFile(join(website, "rspress.config.ts"), "utf8");
assert.match(config, /lang: "zh"/);
assert.ok(!files.some(path => relative(content,path).startsWith("en/")), "English translation awaits Chinese acceptance");
console.log(`Chinese documentation: ${files.length} pages, ${snippets} JavaScript examples parsed; public defaults and error codes match source. Rspress build verifies page links.`);
