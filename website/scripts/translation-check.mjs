import assert from 'node:assert/strict';
import {activePages} from './active-pages.mjs';

export function checkLocalePairs(pages) {
  const english = [...pages.keys()].filter(name => name !== '/' && !name.startsWith('/zh'));
  const chinese = [...pages.keys()].filter(name => name.startsWith('/zh/')).map(name => name.slice(3)).filter(name => name !== '/');
  assert.deepEqual([...english].sort(), [...activePages].sort(), 'English must contain the complete reviewed active page inventory');
  assert.deepEqual(chinese.sort(), english.sort(), 'Missing or unpaired translation page');
  for (const name of english) {
    const body = pages.get(name).text.replace(/```[\s\S]*?```/g, '').replace(/<span id="[^"]+" aria-hidden="true"><\/span>/g, '').replace(/<!--[\s\S]*?-->/g, '');
    assert(!/[\u3400-\u9fff]/u.test(body), 'Untranslated English prose: ' + name);
  }
}

export function checkConfigurationDefaults(limitBody, configuration, locale) {
  for (const [, name, value] of limitBody.matchAll(/(\w+):\s*(\d+)/g)) {
    assert(configuration.split('\n').some(line => line.startsWith('| ' + name + ' |') && line.includes('| ' + value + ' |')), `Incorrect limit documentation (${locale}): ${name}`);
  }
}

// These short, reviewed statements freeze meanings that are easy to invert.
// Wording changes require updating the paired statement and semantic review.
export const semanticStatements = {
  en: [
    ['/guide/quick-start', 'complete does not mean all fields are valid, permission is granted, or business work is done.'],
    ['/guide/fields', 'fields=[] does not clear all inherited values.'],
    ['/guide/multi-turn', 'An Intent instance does not retain conversation history;'],
    ['/integrations/api', '**text is not a final IntentResult**'],
    ['/guide/configuration', 'Necessary sources, issues, and inferences remain'],
    ['/guide/quick-start', 'omitting it still recognizes intent without new business field extraction.'],
    ['/integrations/codex', 'Visible tools without prepare/accept prove only registration.'],
  ],
  zh: [
    ['/guide/quick-start', 'complete不代表字段齐全、授权或业务已执行。'],
    ['/guide/fields', 'fields=[]不是清空所有继承值。'],
    ['/guide/multi-turn', 'Intent实例不保存对话历史；'],
    ['/integrations/api', '**text 不是最终 IntentResult**'],
    ['/guide/configuration', '必要来源、issues、inferences仍保留'],
    ['/guide/quick-start', '省略它仍识别意图，但不新增业务字段提取。'],
    ['/integrations/codex', '工具可见但尚未完成 prepare/accept，只证明登记成功。'],
  ],
};
export function checkTranslationSemantics(page, locale) {
  for (const [route, statement] of semanticStatements[locale]) assert(page(route).includes(statement), `Translation meaning changed (${locale}): ${route}: ${statement}`);
}
