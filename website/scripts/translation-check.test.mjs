import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {checkConfigurationDefaults, checkTranslationSemantics} from './translation-check.mjs';

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
