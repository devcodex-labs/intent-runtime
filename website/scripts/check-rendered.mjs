import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const website = fileURLToPath(new URL("../", import.meta.url));
const dist = join(website, "dist");
const base = "/intent-runtime/";
async function walk(dir, pattern = /\.html$/) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(p, pattern));
    else if (pattern.test(p)) files.push(p);
  }
  return files;
}
const files = await walk(dist);
let references = 0, readmeReferences = 0;
async function verifySiteLink(url, context, currentPath, currentHtml) {
  assert.ok(url.pathname.startsWith(base), `Incorrect base in ${context}: ${url.href}`);
  const name = decodeURIComponent(url.pathname.slice(base.length));
  const target = resolve(dist, url.pathname.endsWith("/") ? name + "index.html" : name);
  assert.ok(target.startsWith(dist + sep), "Path escaped build");
  assert.ok((await stat(target).catch(() => undefined))?.isFile(), `Missing target: ${url.href} in ${context}`);
  if (url.hash && target.endsWith(".html")) {
    const html = target === currentPath ? currentHtml : await readFile(target, "utf8");
    assert.ok(html.includes(`id="${decodeURIComponent(url.hash.slice(1))}"`), `Missing anchor: ${url.href} in ${context}`);
  }
}
for (const path of files) {
  const html = await readFile(path, "utf8");
  assert.match(html, /<html[^>]*lang="zh/);
  assert.doesNotMatch(html, /开发预览|development preview/i, `Unexpected release label: ${path}`);
  const origin = new URL(base + relative(dist, path).replaceAll("\\", "/"), "https://docs.test");
  for (const [,attribute,value] of html.matchAll(/\b(href|src)="([^"]+)"/g)) {
    if (/^(data:|mailto:|tel:|javascript:)/.test(value)) continue;
    const url = new URL(value.replaceAll("&amp;", "&"), origin);
    if (url.origin !== origin.origin) continue;
    await verifySiteLink(url, `${path} (${attribute})`, path, html);
    references++;
  }
}
const root = resolve(website, "..");
const readme = await readFile(join(root, "README.md"), "utf8");
for (const [,href] of readme.matchAll(/\[[^\]\n]+\]\(([^)\s]+)\)/g)) {
  const url = new URL(href, "https://devcodex-labs.github.io/intent-runtime/");
  if (url.origin === "https://devcodex-labs.github.io") {
    await verifySiteLink(url, "README.md");
    readmeReferences++;
  } else if (url.origin === "https://github.com" && url.pathname.startsWith("/devcodex-labs/intent-runtime/blob/main/")) {
    const target = resolve(root, decodeURIComponent(url.pathname.slice("/devcodex-labs/intent-runtime/blob/main/".length)));
    assert.ok(target.startsWith(root + sep), "README source link escaped project");
    assert.ok((await stat(target).catch(() => undefined))?.isFile(), `Missing README source link: ${href}`);
    readmeReferences++;
  }
}
assert.ok(readmeReferences > 0, "README must link to validated documentation");
const llms = await readFile(join(dist, "llms.txt"), "utf8");
assert.doesNotMatch(llms, /开发预览|development preview/i);
const pageCount = (await walk(join(website, "content"), /\.mdx?$/)).length;
assert.equal((llms.match(/^- \[/gm) ?? []).length, pageCount);
assert.equal(files.length, pageCount + 1, "Every source page and the 404 page must render");
assert.match(await readFile(join(dist, "sitemap.xml"), "utf8"), /https:\/\/devcodex-labs.github.io\/intent-runtime\//);
console.log(`Rendered Chinese site: ${files.length} HTML files; ${references} local assets, links and anchors plus ${readmeReferences} README site/source links verified under ${base}; sitemap and ${pageCount}-page llms.txt verified.`);
