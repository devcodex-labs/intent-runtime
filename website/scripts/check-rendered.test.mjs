import test from 'node:test';
import assert from 'node:assert/strict';
import {assertPage, assertSearchIndex, assertLocaleMetadata, inspectHtml, downloads} from './check-rendered.mjs';

const valid = '<h1>完整响应</h1>' + downloads.map(href => `<a href="${href}" download target="_blank">下载</a>`).join('');
test('accept actual anchors, one semantic heading and ordinary code examples', () => {
  assertPage(valid, {home: true, response: true});
  assertPage('<pre><code>import {withBase} from "example";</code></pre>');
  assertSearchIndex(JSON.stringify([{content: '正常响应结构'}]));
});
test('reject the original visible import defect', () => {
  assert.throws(() => assertPage('<p>import {withBase} from "@rspress/core/runtime";</p>'), /raw import/);
});

test('reject a visible component import on a Markdown page but allow it in code', () => {
  assert.throws(() => assertPage("<p>import {Tabs, Tab} from '@theme';</p>"), /raw import/);
  assertPage("<pre><code>import {Tabs, Tab} from '@theme';</code></pre>");
});
test('reject escaped JSX in visible prose', () => {
  assert.throws(() => assertPage('<p>&lt;a href={withBase(\'/examples/order-result.json\')}&gt;下载&lt;/a&gt;</p>'), /raw import/);
});
test('a valid asset URL alone cannot replace a download anchor', () => {
  assert.throws(() => assertPage('<p>' + downloads.join(' ') + '</p>', {response: true}), /Missing real download/);
});
for (const [label, html] of [
  ['one missing anchor', valid.replace(/<a[^>]*>下载<\/a>/, '')],
  ['wrong base', valid.replace('/intent-runtime/examples/', '/examples/')],
  ['rewritten json.html URL', valid.replace('order-result.json"', 'order-result.json.html"')],
  ['missing download attribute', valid.replace(' download', '')],
  ['SPA-intercepted download target', valid.replace(' target="_blank"', '')],
]) test('reject ' + label, () => assert.throws(() => assertPage(html, {response: true}), /Missing real download/));
test('reject missing and duplicate homepage H1', () => {
  assert.throws(() => assertPage('<span>Intent Runtime</span>', {home: true}), /exactly one H1/);
  assert.throws(() => assertPage('<h1>A</h1><h1>B</h1>', {home: true}), /exactly one H1/);
});
test('reject leaked expressions in decoded search index strings', () => {
  assert.throws(() => assertSearchIndex(JSON.stringify([{content: "<a href={withBase('/examples/order-result.json')}>"}])), /search index/);
});

const origin = 'https://devcodex-labs.github.io/intent-runtime/';
function metadata(locale = 'en', page = 'guide/quick-start.html') {
  return [
    {rel: 'canonical', href: origin + (locale === 'zh' ? 'zh/' : '') + page},
    ...['en', 'zh', 'x-default'].map(lang => ({rel: 'alternate', hreflang: lang, href: origin + (lang === 'zh' ? 'zh/' : '') + page})),
  ];
}
test('accept complete absolute locale pairs and framework homepage aliases', () => {
  for (const locale of ['en', 'zh']) assertLocaleMetadata(metadata(locale), (locale === 'zh' ? 'zh/' : '') + 'guide/quick-start.html', locale);
  const home = metadata('en', '');
  home[1].href += 'index.html'; home[2].href += 'index.html';
  assertLocaleMetadata(home, 'index.html', 'en');
});
for (const href of ['/intent-runtime/guide/quick-start.html', '//devcodex-labs.github.io/intent-runtime/guide/quick-start.html', 'mailto:docs@example.com']) test('reject nonabsolute HTTP locale URL: ' + href, () => {
  const links = metadata(); links[1].href = href;
  assert.throws(() => assertLocaleMetadata(links, 'guide/quick-start.html', 'en'), /fully qualified/);
});
test('reject a duplicated locale even when one declaration is correct', () => {
  const links = metadata(); links.push({...links[1], href: origin});
  assert.throws(() => assertLocaleMetadata(links, 'guide/quick-start.html', 'en'), /exactly one locale alternate/);
});
test('reject an absolute alternate pointing to the wrong language page', () => {
  const links = metadata(); links[2].href = links[1].href;
  assert.throws(() => assertLocaleMetadata(links, 'guide/quick-start.html', 'en'), /Incorrect locale alternate/);
});
test('reject a missing language alternate', () => {
  const links = metadata(); links.splice(2, 1);
  assert.throws(() => assertLocaleMetadata(links, 'guide/quick-start.html', 'en'), /exactly one locale alternate/);
});
test('reject duplicate canonical declarations', () => {
  const links = metadata(); links.push({...links[0]});
  assert.throws(() => assertLocaleMetadata(links, 'guide/quick-start.html', 'en'), /exactly one canonical/);
});
test('duplicate IDs cannot hide behind the rendered anchor inventory', () => {
  assert.throws(() => inspectHtml('<span id="same"></span><h2 id="same">B</h2>'), /Duplicate rendered ID/);
});
