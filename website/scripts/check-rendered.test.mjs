import test from 'node:test';
import assert from 'node:assert/strict';
import {assertPage, assertSearchIndex, downloads} from './check-rendered.mjs';

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
