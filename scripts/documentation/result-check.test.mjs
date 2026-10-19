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

function current() {
  return {turn: {intentIds: ['current'], facts: {}, changes: []}, effective: {intents: [{...structuredClone(old), id: 'current', inputs: {}, extensions: {}}], constraints: [], relations: []}, fieldResults: [], issues: [], inferences: []};
}
const source = {root: 'context', pointer: '/meta/a~1b/~0', quote: 'provided'};
const sourceMaterials = {input: 'Inspect the supplied metadata', context: {meta: {'': 'empty name', 'a/b': {'~': 'provided value'}}}};
const sourceLocations = [
  ['change', (r, ref) => r.turn.changes.push({operation: 'modify', effect: 'applied', target: {kind: 'intent', id: 'current'}, sourceRefs: [ref]})],
  ['field', (r, ref) => r.fieldResults.push({sourceRefs: [ref]})],
  ['intent reference', (r, ref) => r.effective.intents[0].references.push({id: 'reference', sourceRefs: [ref]})],
  ['issue', (r, ref) => r.issues.push({id: 'issue', sourceRefs: [ref]})],
  ['issue candidate', (r, ref) => r.issues.push({id: 'issue', candidates: [{id: 'candidate', sourceRefs: [ref]}]})],
  ['inference', (r, ref) => r.inferences.push({target: '/turn', sourceRefs: [ref]})],
  ['evidence', (r, ref) => {r.evidence = [{target: '/turn', sourceRefs: [ref]}];}],
  ['global expression', (r, ref) => r.effective.constraints.push({id: 'constraint', expression: {type: 'comparison', left: {type: 'source', ref}, operator: 'eq', right: {type: 'literal', value: true}}})],
  ['nested intent expression', (r, ref) => r.effective.intents[0].children.push({...structuredClone(old), id: 'child', constraints: [{id: 'constraint', expression: {type: 'all', items: [{type: 'any', items: [{type: 'not', item: {type: 'comparison', left: {type: 'literal', value: true}, operator: 'eq', right: {type: 'source', ref}}}]}]}}]})],
];
for (const [name, add] of sourceLocations) test('source validation remains strict in ' + name, () => {
  const check = ref => {const r = current(); add(r, ref); checkResultLinks(r, sourceMaterials);};
  check(source);
  check({root: 'context', pointer: '/meta/', quote: 'empty name'});
  assert.throws(() => check({...source, root: 'baseline'}), /Missing source root/);
  assert.throws(() => check({...source, pointer: '/missing'}), /\/missing/);
  assert.throws(() => check({...source, pointer: '/a~2b'}), /Invalid pointer escape/);
  assert.throws(() => check({...source, pointer: 'meta/a'}), /Expected JSON Pointer/);
  assert.throws(() => check({...source, quote: 'invented quotation'}));
});
test('business JSON may use source-like keys without becoming a SourceRef', () => {
  const r = current(), business = {root: 'sales', pointer: 'invoice-000123', sourceRefs: [{root: 'business', pointer: 'not a pointer'}]};
  r.effective.intents[0].inputs.metadata = business;
  r.effective.intents[0].extensions.metadata = business;
  r.turn.facts.metadata = business;
  r.turn.changes = [{operation: 'modify', effect: 'applied', target: {kind: 'intent', id: 'current'}, sourceRefs: [source], deltas: [{path: '/inputs/metadata', operation: 'set', before: business, after: business}]}];
  r.effective.constraints = [{id: 'constraint', expression: {type: 'comparison', left: {type: 'literal', value: business}, operator: 'eq', right: {type: 'literal', value: null}}}];
  r.inferences = [{target: '/effective/intents/0/inputs/metadata', candidate: business, sourceRefs: [source]}];
  checkResultLinks(r, sourceMaterials);
});
