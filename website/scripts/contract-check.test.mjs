import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {checkResponseFields, checkTypeSnippet} from './contract-check.mjs';
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
