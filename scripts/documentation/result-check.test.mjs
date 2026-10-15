import test from 'node:test';
import assert from 'node:assert/strict';
import {checkResultLinks, pointer, readableIds} from './result-check.mjs';

const old = {id: 'old', constraints: [], references: [], children: []};
const materials = {input: '撤回旧请求', baseline: {intents: [old], constraints: [], relations: []}};
function withdrawn() {return {turn: {intentIds: [], changes: [{operation: 'withdraw', effect: 'applied', target: {kind: 'intent', id: 'old'}}]}, effective: {intents: [], constraints: [], relations: []}, inferences: []};}
test('withdrawal may reference a baseline intent absent from effective', () => checkResultLinks(withdrawn(), materials));
test('derived issue IDs and nested baseline references use the same readable ID', () => {
  const id = 'intent-c7135d1a-ad05-4894-a974-07b2fb6dac12';
  assert.deepEqual(readableIds({id, issue: 'understanding-' + id, baseline: {id}, orderId: '000123'}), {id: 'intent-1', issue: 'understanding-intent-1', baseline: {id: 'intent-1'}, orderId: '000123'});
});
test('invented prior IDs remain invalid', () => {const r = withdrawn(); r.turn.changes[0].target.id = 'invented'; assert.throws(() => checkResultLinks(r, materials), /supplied prior/);});
test('a prior intent cannot authorize a constraint target', () => {const r = withdrawn(); r.turn.changes[0].target.kind = 'constraint'; assert.throws(() => checkResultLinks(r, materials), /supplied prior/);});
test('arbitrary Context strings do not authorize prior IDs', () => assert.throws(() => checkResultLinks(withdrawn(), {input: '撤回', context: {note: 'old'}}), /supplied prior/));
test('a condition must reference a current constraint, not an intent', () => {
  const r = withdrawn(); r.effective.intents = [old]; r.turn.intentIds = ['old'];
  r.turn.changes = [{operation: 'withdraw', effect: 'conditional', target: {kind: 'intent', id: 'old'}, conditionId: 'old'}];
  assert.throws(() => checkResultLinks(r, materials), /current constraint/);
});
test('pointer preserves empty names and escaped keys and rejects malformed paths', () => {
  assert.equal(pointer({meta: {'': 1}}, '/meta/'), 1);
  assert.equal(pointer({'a/b': {'~': 2}}, '/a~1b/~0'), 2);
  assert.throws(() => pointer({}, '/a~2b'), /escape/);
  assert.throws(() => pointer({}, 'orders/1/amount'), /JSON Pointer/);
});
