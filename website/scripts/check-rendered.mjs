import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from 'parse5';

export const base = '/intent-runtime/';
const scenarios = JSON.parse(await readFile(new URL('../content/public/examples/scenarios.json', import.meta.url), 'utf8'));
const names = ['order-request', 'order-result', 'clarification-request', 'clarification-result', 'native-request', 'native-result', 'executor-request', 'executor-result', 'scenarios', ...scenarios.cases.map(c => c.slug + '-example')].map(name => name + '.json');
export const downloadsByLocale = Object.fromEntries(['en', 'zh'].map(locale => [locale, names.map(name => base + 'examples/' + (locale === 'en' ? 'en/' : '') + name)]));
export const downloads = downloadsByLocale.en;
const leakedSyntax = /import\s*\{\s*withBase\s*\}|href\s*=\s*\{\s*withBase\s*\(/u;
export function inspectHtml(html) {
  const links = [], headLinks = [], ids = new Set(), text = [];
  let h1 = 0, lang;
  function visit(node, excluded = false) {
    const attrs = Object.fromEntries((node.attrs ?? []).map(a => [a.name, a.value]));
    if (node.tagName === 'html') lang = attrs.lang;
    if (node.tagName === 'h1') h1++;
    if (attrs.id) ids.add(attrs.id);
    if (node.tagName === 'a' && attrs.href !== undefined) links.push(attrs);
    if (node.tagName === 'link' && attrs.href !== undefined) headLinks.push(attrs);
    const hidden = excluded || ['script', 'style', 'pre', 'code'].includes(node.tagName);
    if (node.nodeName === '#text' && !hidden) text.push(node.value);
    for (const child of node.childNodes ?? []) visit(child, hidden);
  }
  visit(parse(html));
  return {links, headLinks, ids, h1, lang, visibleText: text.join('')};
}
/** Validate raw SEO declarations before resolving paths; relative URLs are not hreflang URLs. */
export function assertLocaleMetadata(headLinks, name, locale) {
  const pure = name.replace(/^zh\//, '').replace(/^index\.html$/, '');
  const url = lang => 'https://devcodex-labs.github.io/intent-runtime/' + (lang === 'zh' ? 'zh/' : '') + pure;
  const canonical = headLinks.filter(link => link.rel === 'canonical');
  assert.equal(canonical.length, 1, 'Expected exactly one canonical URL: ' + name);
  assert.equal(canonical[0].href, url(locale), 'Incorrect locale canonical URL: ' + name);
  for (const lang of ['en', 'zh', 'x-default']) {
    const links = headLinks.filter(link => link.rel === 'alternate' && link.hreflang === lang);
    assert.equal(links.length, 1, 'Expected exactly one locale alternate: ' + name + ':' + lang);
    assert(/^https?:\/\//.test(links[0].href), 'Locale alternate must be fully qualified: ' + name + ':' + lang);
    assert.equal(new URL(links[0].href).href.replace(/\/index\.html$/, '/'), url(lang).replace(/\/index\.html$/, '/'), 'Incorrect locale alternate URL: ' + name + ':' + lang);
  }
}
export function assertPage(html, {home = false, response = false, locale = 'en'} = {}) {
  const result = inspectHtml(html);
  assert(!leakedSyntax.test(result.visibleText), 'Visible raw import/JSX expression');
  assert(!/\bimport\s*\{[^}]+\}\s*from\s*['"][^'"]+['"]/.test(result.visibleText), 'Visible raw import statement; interactive pages must use MDX');
  if (home) assert.equal(result.h1, 1, 'Homepage must contain exactly one H1');
  if (response) for (const href of downloadsByLocale[locale]) {
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
    const locale = name.startsWith('zh/') ? 'zh' : 'en';
    pages.set(name, assertPage(await readFile(file, 'utf8'), {home: /^(?:zh\/)?index\.html$/.test(name), response: /^(?:zh\/)?api\/response\.html$/.test(name), locale}));
    if (name !== '404.html') {
      assert.equal(pages.get(name).lang, locale, 'Incorrect page language: ' + name);
      assertLocaleMetadata(pages.get(name).headLinks, name, locale);
      if (locale === 'en') assert(!/[\u3400-\u9fff]/u.test(pages.get(name).visibleText.replaceAll('简体中文', '')), 'Untranslated English UI/prose: ' + name);
    }
    if (name !== '404.html') assert.equal(pages.get(name).h1, 1, 'Documentation page must have one H1: ' + name);
  }
  for (const prefix of ['', 'zh/']) {
    assert(pages.has(prefix + 'index.html') && pages.has(prefix + 'api/response.html'), 'Missing required locale page: ' + prefix);
    const home = pages.get(prefix + 'index.html');
    for (const route of ['guide/quick-start', 'integrations/index', 'api/intent', 'examples/index', 'testing/validation']) assert(home.links.some(anchor => anchor.href.replace(/\.html$/, '') === base + prefix + route), 'Missing locale navigation: ' + prefix + route);
  }
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
  assert(indices.length >= 2, 'Separate locale search indices were not generated');
  for (const file of indices) assertSearchIndex(await readFile(file, 'utf8'));
  const publicRoot = fileURLToPath(new URL('../content/public/', import.meta.url));
  for (const href of Object.values(downloadsByLocale).flat()) {
    const name = href.slice(base.length);
    assert(available.has(name), 'Download asset missing: ' + name);
    assert.deepEqual(JSON.parse(await readFile(path.join(root, name), 'utf8')), JSON.parse(await readFile(path.join(publicRoot, name), 'utf8')), 'Download differs from documented fixture');
  }
  return {pages: pages.size, internalLinksAndAnchors: links, downloadAnchors: Object.values(downloadsByLocale).flat().length, searchIndices: indices.length, homeH1: 1};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(process.env.INTENT_DOCS_DIR ?? 'dist');
  console.log('Rendered documentation checked: ' + JSON.stringify(await checkRendered(root)));
}
