import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {checkResponseFields, checkTypeSnippet, checkPublicTypes, documentationBlocks} from './contract-check.mjs';
const source = await readFile(new URL('../../src/contracts/public.ts', import.meta.url), 'utf8');
const response = await readFile(new URL('../content/en/api/response.md', import.meta.url), 'utf8');

test('generated JavaScript markers cannot silently skip malformed or TypeScript blocks', () => {
  const block = '{/* javascript: examples/api/basic.ts */}\r\n\r\n```js\r\nconst value = 1;\r\n```';
  const [match] = documentationBlocks(block, 'javascript');
  assert.equal(match[1], 'examples/api/basic.ts');
  assert.equal(match[2], 'const value = 1;');
  assert.throws(() => documentationBlocks(block.replace('```js', '```ts'), 'javascript'), /Unmatched documentation marker/);
  assert.throws(() => documentationBlocks(block.replace(/\r\n```$/, ''), 'javascript'), /Unmatched documentation marker/);
});
test('public indexed access compiles; nonexistent TurnKind is rejected', () => {
  checkTypeSnippet("import type {TurnUnderstanding} from '@devcodex/intent-runtime'; type Kind = TurnUnderstanding['kind'];");
  assert.throws(() => checkTypeSnippet('type Turn = {kind: TurnKind};'), /TurnKind/);
});
test('a field mentioned in JSON cannot replace its contract row with LF or CRLF', () => {
  for (const newline of ['\n', '\r\n']) {
    const markdown = response.replace(/\r\n?/g, '\n').replaceAll('\n', newline);
    assert(checkResponseFields(source, markdown) > 100);
    const missing = markdown.replace(/^\| turn\.facts \|.*\r?\n/m, '');
    assert.throws(() => checkResponseFields(source, missing), /turn\.facts/);
  }
});
test('public type parity accepts LF/CRLF but rejects an actual contract change', () => {
  const types = '// Public contract: test\nexport type Result = {value: string};\n';
  checkPublicTypes(types.replaceAll('\n', '\r\n'), '```ts\n' + types.split('\n').slice(1).join('\n') + '```');
  assert.throws(() => checkPublicTypes(types, 'export type Result = {value: number};'), /stale/);
});
test('marked examples and contracts are checked in both newline forms; malformed blocks cannot silently disappear', () => {
  for (const newline of ['\n', '\r\n']) {
    const example = ['<!-- example: examples/api/basic.mjs -->', '```js', 'console.log(1);', '```'].join(newline);
    assert.equal(documentationBlocks(example, 'example').length, 1);
    const mdx = example.replace('<!-- example: examples/api/basic.mjs -->', '{/* example: examples/api/basic.mjs */}');
    assert.equal(documentationBlocks(mdx, 'example').length, 1);
    assert.throws(() => documentationBlocks(mdx.replace('```js', '```python'), 'example'), /Unmatched/);
    assert.throws(() => documentationBlocks(example.replace('```js', '```python'), 'example'), /Unmatched/);
    for (const kind of ['result', 'json']) {
      const block = ['<!-- ' + kind + ': native -->', '```json', '{}', '```'].join(newline);
      assert.equal(documentationBlocks(block, kind).length, 1);
      assert.throws(() => documentationBlocks(block.replace('```json', '```text'), kind), /Unmatched/);
    }
    assert.equal(documentationBlocks(['<!-- typecheck -->', '```ts', 'type T = string;', '```'].join(newline), 'typecheck').length, 1);
  }
});
