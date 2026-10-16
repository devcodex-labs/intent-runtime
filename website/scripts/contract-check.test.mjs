import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {checkResponseFields, checkTypeSnippet, checkPublicTypes, documentationBlocks} from './contract-check.mjs';
const source = await readFile(new URL('../../src/contracts/public.ts', import.meta.url), 'utf8');
const response = await readFile(new URL('../content/api/response.md', import.meta.url), 'utf8');
test('public indexed access compiles; nonexistent TurnKind is rejected', () => {
  checkTypeSnippet("import type {TurnUnderstanding} from '@devcodex/intent-runtime'; type Kind = TurnUnderstanding['kind'];");
  assert.throws(() => checkTypeSnippet('type Turn = {kind: TurnKind};'), /TurnKind/);
});
test('a field mentioned in JSON cannot replace its contract row', () => {
  assert(checkResponseFields(source, response) > 100);
  const missing = response.replace(/^\| turn\.facts \|.*\n/m, '');
  assert.throws(() => checkResponseFields(source, missing), /turn\.facts/);
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
    assert.throws(() => documentationBlocks(example.replace('```js', '```python'), 'example'), /Unmatched/);
    for (const kind of ['result', 'json']) {
      const block = ['<!-- ' + kind + ': native -->', '```json', '{}', '```'].join(newline);
      assert.equal(documentationBlocks(block, kind).length, 1);
      assert.throws(() => documentationBlocks(block.replace('```json', '```text'), kind), /Unmatched/);
    }
    assert.equal(documentationBlocks(['<!-- typecheck -->', '```ts', 'type T = string;', '```'].join(newline), 'typecheck').length, 1);
  }
});
