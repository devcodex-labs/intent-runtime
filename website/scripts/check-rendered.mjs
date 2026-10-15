import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from 'parse5';

export const base = '/intent-runtime/';
const scenarios = JSON.parse(await readFile(new URL('../content/public/examples/scenarios.json', import.meta.url), 'utf8'));
export const downloads = ['order-request', 'order-result', 'clarification-request', 'clarification-result', 'native-request', 'native-result', 'executor-request', 'executor-result', 'scenarios', ...scenarios.cases.map(c => c.slug + '-example')].map(name => base + 'examples/' + name + '.json');
const leakedSyntax = /import\s*\{\s*withBase\s*\}|href\s*=\s*\{\s*withBase\s*\(/u;
export function inspectHtml(html) {
  const links = [], ids = new Set(), text = [];
  let h1 = 0;
  function visit(node, excluded = false) {
    const attrs = Object.fromEntries((node.attrs ?? []).map(a => [a.name, a.value]));
    if (node.tagName === 'h1') h1++;
    if (attrs.id) ids.add(attrs.id);
    if (node.tagName === 'a' && attrs.href !== undefined) links.push(attrs);
    const hidden = excluded || ['script', 'style', 'pre', 'code'].includes(node.tagName);
    if (node.nodeName === '#text' && !hidden) text.push(node.value);
    for (const child of node.childNodes ?? []) visit(child, hidden);
  }
  visit(parse(html));
  return {links, ids, h1, visibleText: text.join('')};
}
export function assertPage(html, {home = false, response = false} = {}) {
  const result = inspectHtml(html);
  assert(!leakedSyntax.test(result.visibleText), 'Visible raw import/JSX expression');
  if (home) assert.equal(result.h1, 1, 'Homepage must contain exactly one H1');
  if (response) for (const href of downloads) {
    // Rspress 2.0.23 intercepts same-window links even with download. A separate
    // target bypasses its SPA navigation; the browser honors download first.
    assert(result.links.some(a => a.href === href && Object.hasOwn(a, 'download') && a.target === '_blank'), 'Missing real download anchor with native handling: ' + href);
  }
  return result;
}
export function assertSearchIndex(text) {
  const data = JSON.parse(text);
  function visit(value) {
    if (typeof value === 'string') assert(!leakedSyntax.test(value), 'Raw JSX/import in search index');
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  }
  visit(data);
}
export async function checkRendered(root) {
  const files = [];
  async function scan(dir) {for (const item of await readdir(dir, {withFileTypes: true})) {const file = path.join(dir, item.name); if (item.isDirectory()) await scan(file); else files.push(file);}}
  await scan(root);
  const relative = file => path.relative(root, file).replaceAll(path.sep, '/');
  const available = new Set(files.map(relative)), pages = new Map();
  for (const file of files.filter(file => file.endsWith('.html'))) {
    const name = relative(file);
    pages.set(name, assertPage(await readFile(file, 'utf8'), {home: name === 'index.html', response: name === 'api/response.html'}));
    if (name !== '404.html') assert.equal(pages.get(name).h1, 1, 'Documentation page must have one H1: ' + name);
  }
  assert(pages.has('index.html') && pages.has('api/response.html'), 'Missing required rendered page');
  let links = 0;
  for (const [name, page] of pages) for (const anchor of page.links) {
    const url = new URL(anchor.href, 'https://site.invalid' + base + name);
    if (url.origin !== 'https://site.invalid') continue;
    assert(url.pathname.startsWith(base), 'Link escapes configured base: ' + anchor.href);
    let target = decodeURIComponent(url.pathname.slice(base.length));
    if (!target || target.endsWith('/')) target += 'index.html';
    if (!available.has(target) && !path.posix.extname(target)) target += '.html';
    assert(available.has(target), 'Missing rendered link: ' + name + ' -> ' + anchor.href);
    if (url.hash && pages.has(target)) assert(pages.get(target).ids.has(decodeURIComponent(url.hash.slice(1))), 'Missing rendered anchor: ' + anchor.href);
    links++;
  }
  const indices = files.filter(file => /(?:^|\/)search_index\.[^/]+\.json$/.test(relative(file)));
  assert(indices.length > 0, 'Search index was not generated');
  for (const file of indices) assertSearchIndex(await readFile(file, 'utf8'));
  const publicRoot = fileURLToPath(new URL('../content/public/', import.meta.url));
  for (const href of downloads) {
    const name = href.slice(base.length);
    assert(available.has(name), 'Download asset missing: ' + name);
    assert.deepEqual(JSON.parse(await readFile(path.join(root, name), 'utf8')), JSON.parse(await readFile(path.join(publicRoot, name), 'utf8')), 'Download differs from documented fixture');
  }
  return {pages: pages.size, internalLinksAndAnchors: links, downloadAnchors: downloads.length, searchIndices: indices.length, homeH1: 1};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(process.env.INTENT_DOCS_DIR ?? 'dist');
  console.log('Rendered documentation checked: ' + JSON.stringify(await checkRendered(root)));
}
