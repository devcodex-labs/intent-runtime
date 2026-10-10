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
let references = 0;
for (const path of files) {
  const html = await readFile(path, "utf8");
  assert.match(html, /<html[^>]*lang="zh/);
  assert.doesNotMatch(html, /开发预览|development preview/i, `Unexpected release label: ${path}`);
  const origin = new URL(base + relative(dist, path).replaceAll("\\", "/"), "https://docs.test");
  for (const [,attribute,value] of html.matchAll(/\b(href|src)="([^"]+)"/g)) {
    if (/^(data:|mailto:|tel:|javascript:)/.test(value)) continue;
    const url = new URL(value.replaceAll("&amp;", "&"), origin);
    if (url.origin !== origin.origin) continue;
    assert.ok(url.pathname.startsWith(base), `Incorrect base in ${path}: ${value}`);
    const name = decodeURIComponent(url.pathname.slice(base.length));
    const target = resolve(dist, url.pathname.endsWith("/") ? name + "index.html" : name);
    assert.ok(target.startsWith(dist + sep), "Path escaped build");
    // All documented pages use .html links; anchor-only links keep current file.
    assert.ok((await stat(target).catch(() => undefined))?.isFile(), `Missing ${attribute}: ${value} in ${path}`);
    if (url.hash && target.endsWith(".html")) {
      const targetHtml = target === path ? html : await readFile(target, "utf8");
      assert.ok(targetHtml.includes(`id="${decodeURIComponent(url.hash.slice(1))}"`), `Missing anchor: ${value} in ${path}`);
    }
    references++;
  }
}
const llms = await readFile(join(dist, "llms.txt"), "utf8");
assert.doesNotMatch(llms, /开发预览|development preview/i);
const pageCount = (await walk(join(website, "content"), /\.mdx?$/)).length;
assert.equal((llms.match(/^- \[/gm) ?? []).length, pageCount);
assert.equal(files.length, pageCount + 1, "Every source page and the 404 page must render");
assert.match(await readFile(join(dist, "sitemap.xml"), "utf8"), /https:\/\/devcodex-labs.github.io\/intent-runtime\//);
console.log(`Rendered Chinese site: ${files.length} HTML files; ${references} local assets, links and anchors verified under ${base}; sitemap and ${pageCount}-page llms.txt verified.`);
