import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {checkConfigurationDefaults, checkTranslationSemantics, checkLocalePairs} from './translation-check.mjs';
import {activePages} from './active-pages.mjs';

test('every current user page needs both translations', () => {
  const pages = new Map(activePages.flatMap(route => [[route, {text:''}], ['/zh' + route, {text:''}]]));
  checkLocalePairs(pages);
  for (const route of activePages) {
    const incomplete = new Map(pages); incomplete.delete('/zh' + route);
    assert.throws(() => checkLocalePairs(incomplete), /Missing or unpaired translation page/);
  }
});
test('removing an entire page pair cannot reduce the reviewed documentation inventory', () => {
  const pages = new Map(activePages.flatMap(route => [[route, {text:''}], ['/zh' + route, {text:''}]]));
  for (const route of activePages) {
    const incomplete = new Map(pages); incomplete.delete(route); incomplete.delete('/zh' + route);
    assert.throws(() => checkLocalePairs(incomplete), /complete reviewed active page inventory/);
  }
});

for (const locale of ['en', 'zh']) {
  test(`${locale} default contract rejects an incorrect translated limit`, async () => {
    const text = await readFile(new URL(`../content/${locale}/guide/configuration.md`, import.meta.url), 'utf8');
    checkConfigurationDefaults('maxInputBytes: 65536', text, locale);
    assert.throws(() => checkConfigurationDefaults('maxInputBytes: 65536', text.replace('| maxInputBytes | 65536 |', '| maxInputBytes | 1 |'), locale), /Incorrect limit documentation/);
  });
  test(`${locale} negative meanings cannot silently drift`, async () => {
    const pages = new Map();
    for (const route of ['guide/quick-start.mdx', 'guide/fields.md', 'guide/multi-turn.md', 'integrations/api.md', 'guide/configuration.md', 'integrations/codex.md']) pages.set('/' + route.replace(/\.(md|mdx)$/, ''), await readFile(new URL(`../content/${locale}/${route}`, import.meta.url), 'utf8'));
    checkTranslationSemantics(route => pages.get(route), locale);
    const route = '/guide/fields';
    pages.set(route, pages.get(route).replace(locale === 'en' ? 'fields=[] does not clear all inherited values.' : 'fields=[]不是清空所有继承值。', 'fields=[] clears all inherited values.'));
    assert.throws(() => checkTranslationSemantics(name => pages.get(name), locale), /Translation meaning changed/);
  });
}
