import test from 'node:test';
import assert from 'node:assert/strict';
import {Intent, IntentError, type IntentResult} from '../src/index.js';
import {createIntentMcpAdapter, type HostTask} from '../src/mcp/index.js';
import type {CandidateDraft} from '../src/model/candidate.js';
import {controlled, draft, observation, retain, src} from './helpers.js';

type Claim = CandidateDraft['issues'][number];
const claim = (key: string, field: string, ownerKey: string | null = 'a', path = '/' + field, code = 'FIELD_VALUE_INVALID', container: 'inputs' | 'facts' | 'extensions' = 'inputs'): Claim => ({key, ownerKey, fieldTarget: {container, field, path}, code, category: 'data', message: 'The supplied field claim.', sources: [src], candidates: [], questions: []});
const numberSchema = {type: 'object', properties: {amount: {type: 'number', minimum: 0}}};
const rejectsAt = (path: string) => (error: unknown) => error instanceof IntentError && error.code === 'MODEL_OUTPUT_INVALID' && error.details?.violations?.[0]?.path === path;

test('Formal inherited invalidation coalesces a model claim and resolves its suggestion before recovery', async () => {
  let d = draft(); d.observations = [observation('recordId', 'A12'), observation('expedited', true), observation('allowance', 7)];
  const schema = {type: 'object', properties: {recordId: {type: 'string'}, expedited: {type: 'boolean'}, allowance: {type: 'number'}}, if: {properties: {expedited: {const: true}}, required: ['expedited']}, then: {properties: {allowance: {maximum: 9}}}, else: {properties: {allowance: {maximum: 3}}}};
  const intent = new Intent({schema, executor: controlled(() => d)});
  try {
    const first = await intent.parse({input: 'Deliver A12, expedited true, allowance 7', fields: 'all'});
    d = retain(draft()); d.observations = [observation('expedited', false)];
    d.issues = [claim('prior-value', 'allowance')];
    d.suggestions = [{kind: 'clarification', text: 'Supply a permitted allowance.', relatesTo: ['issue:prior-value']}];
    const changed = await intent.parse({input: 'Disable expedited delivery; keep the goal', fields: ['expedited'], baseline: first.effective, output: {suggestions: true}});
    assert.equal(changed.status, 'complete'); assert.equal(changed.effective.intents[0]!.id, first.effective.intents[0]!.id);
    assert.deepEqual(changed.effective.intents[0]!.inputs, {recordId: 'A12', expedited: false});
    assert.deepEqual(changed.issues.map(q => q.code), ['FIELD_INVALIDATED']);
    assert.deepEqual(changed.suggestions![0]!.relatesTo, [changed.issues[0]!.id]);
    assert(changed.fieldResults.some(f => f.field === 'allowance' && f.status === 'invalidated'));
    d = retain(draft()); d.observations = [observation('allowance', 2)];
    const recovered = await intent.parse({input: 'Allowance is now 2', fields: ['allowance'], baseline: changed.effective});
    assert.equal(recovered.effective.intents[0]!.id, first.effective.intents[0]!.id);
    assert.deepEqual(recovered.effective.intents[0]!.inputs, {recordId: 'A12', expedited: false, allowance: 2});
    assert.deepEqual(recovered.issues, []);
  } finally {await intent.dispose();}
});

test('Merged claims preserve local options, sources and prefixed suggestion references without extra validation', async () => {
  const d = draft(); d.observations = [observation('amount', -1)];
  d.issues = ['a', '__proto__', 'issue:a'].map(key => ({
    ...claim(key, 'amount'),
    candidates: [{key: 'same-local-key', description: 'A correction for ' + key, intentKey: 'a', sources: [src]}],
    questions: [{question: 'Choose for ' + key, optionKeys: ['same-local-key']}],
  }));
  d.suggestions = d.issues.map(q => ({kind: 'clarification', text: q.key, relatesTo: ['issue:' + q.key, 'intent:a']}));
  const before = JSON.stringify(d), intent = new Intent({schema: numberSchema, limits: {maxValidationChecks: 1}, executor: controlled(() => d)});
  try {
    const r = await intent.parse({input: 'amount -1', fields: ['amount'], output: {suggestions: true}});
    assert.equal(r.issues.length, 1); const q = r.issues[0]!;
    assert.equal(q.code, 'FIELD_VALUE_INVALID'); assert.equal(q.path, '/amount');
    assert.equal(q.candidates!.length, 3); assert.equal(new Set(q.candidates!.map(c => c.id)).size, 3);
    assert.equal(q.questions!.length, 3);
    q.questions!.forEach((question, index) => assert.deepEqual(question.optionIds, [q.candidates![index]!.id]));
    assert(q.sourceRefs!.length >= 3);
    r.suggestions!.forEach(s => assert.deepEqual(s.relatesTo, [q.id, r.effective.intents[0]!.id]));
    assert.equal(JSON.stringify(d), before); assert(!JSON.stringify(r).includes('modelKeys'));
  } finally {await intent.dispose();}
});

for (const code of ['FIELD_VALUE_INVALID', 'FIELD_REQUIRED_MISSING', 'FIELD_DEPENDENCY_MISSING', 'FIELD_VALIDATION_UNDETERMINED']) test('A formally valid value rejects every contradictory formal claim: ' + code, async () => {
  const d = draft(); d.observations = [observation('amount', 1)]; d.issues = [claim('wrong', 'amount', 'a', '/amount', code)];
  const intent = new Intent({schema: numberSchema, executor: controlled(() => d)});
  try {await assert.rejects(intent.parse({input: 'amount 1', fields: ['amount']}), rejectsAt('/issues/0/code'));} finally {await intent.dispose();}
});

test('All formal claims are checked, including a contradictory second claim', async () => {
  const d = draft(); d.observations = [observation('amount', -1)];
  d.issues = [claim('correct', 'amount'), claim('wrong', 'amount', 'a', '/amount', 'FIELD_DEPENDENCY_MISSING')];
  const intent = new Intent({schema: numberSchema, executor: controlled(() => d)});
  try {await assert.rejects(intent.parse({input: 'amount -1', fields: ['amount']}), rejectsAt('/issues/1/code'));} finally {await intent.dispose();}
});

test('Equal fields on different owners never share a public diagnostic', async () => {
  const d = draft(['a', 'b']); d.observations = [observation('amount', -1), observation('amount', -2, 'b')];
  d.issues = [claim('first', 'amount'), claim('second', 'amount', 'b')];
  const intent = new Intent({schema: numberSchema, executor: controlled(() => d)});
  try {
    const r = await intent.parse({input: 'a amount -1; b amount -2', fields: ['amount']});
    assert.equal(r.issues.length, 2); assert.equal(new Set(r.issues.map(q => q.id)).size, 2);
    assert.deepEqual(new Set(r.issues.map(q => q.intentId)), new Set(r.effective.intents.map(n => n.id)));
  } finally {await intent.dispose();}
});

test('Independent nested failure paths coalesce separately and cannot absorb an unrelated path', async () => {
  const d = draft(); d.observations = [observation('lines', [{amount: -1}, {amount: -2}, {amount: 3}])];
  d.issues = [claim('first', 'lines', 'a', '/lines/0/amount'), claim('second', 'lines', 'a', '/lines/1/amount')];
  const schema = {type: 'object', properties: {lines: {type: 'array', items: {type: 'object', properties: {amount: {type: 'number', minimum: 0}}}}}};
  const intent = new Intent({schema, executor: controlled(() => d)});
  try {
    const r = await intent.parse({input: 'line amounts -1, -2, 3', fields: ['lines']});
    assert.deepEqual(r.issues.map(q => q.path).sort(), ['/lines/0/amount', '/lines/1/amount']);
    assert.equal(new Set(r.fieldResults.map(f => f.path)).size, r.fieldResults.length);
    d.issues[1]!.fieldTarget!.path = '/lines/2/amount';
    await assert.rejects(intent.parse({input: 'line amounts -1, -2, 3', fields: ['lines']}), rejectsAt('/issues/1/fieldTarget/path'));
  } finally {await intent.dispose();}
});

test('Distinct prose diagnoses and their questions remain distinct on the same field', async () => {
  const d = draft(); d.observations = [observation('end', '09:00'), observation('start', '10:00')];
  d.observations[0]!.semantic = {status: 'invalid', explanation: 'End precedes start and is outside business hours.', sources: [src], dependencies: [{field: 'start', requires: 'value'}]};
  d.issues = ['order', 'hours'].map(key => ({...claim(key, 'end'), candidates: [{key: 'option', description: key, intentKey: null, sources: [src]}], questions: [{question: key, optionKeys: ['option']}]}));
  const intent = new Intent({schema: {type: 'object', properties: {start: {type: 'string'}, end: {type: 'string', description: 'End must follow start and be in business hours.'}}}, executor: controlled(() => d)});
  try {
    const r = await intent.parse({input: 'Start 10:00, end 09:00 outside business hours', fields: 'all'});
    assert.equal(r.issues.length, 2); assert.deepEqual(r.issues.map(q => q.questions![0]!.question), ['order', 'hours']);
    assert.equal(Object.hasOwn(r.effective.intents[0]!.inputs, 'end'), false);
  } finally {await intent.dispose();}
});

for (const code of ['FIELD_CARDINALITY_MISMATCH', 'FIELD_APPLICABILITY_UNKNOWN']) test('Semantic field evidence survives a valid scalar declaration: ' + code, async () => {
  const d = draft(); d.observations = [observation('label', 'first')]; d.issues = [claim('semantic', 'label', 'a', '/label', code)];
  const intent = new Intent({schema: {type: 'object', properties: {label: {type: 'string'}}}, executor: controlled(() => d)});
  try {
    const r = await intent.parse({input: 'An ambiguous choice of first or second', fields: ['label']});
    assert.equal(r.issues.length, 1); assert.equal(r.issues[0]!.code, code); assert.deepEqual(r.effective.intents[0]!.inputs, {});
  } finally {await intent.dispose();}
});

for (const container of ['facts', 'extensions'] as const) test('Formal ' + container + ' diagnostics use proof-backed mapping', async () => {
    const d = draft(container === 'facts' ? [] : ['a']); if (container === 'facts') d.kind = 'statement';
    const owner = container === 'facts' ? null : 'a'; d.observations = [observation('amount', -1, owner, container)]; d.issues = [claim('problem', 'amount', owner, '/amount', 'FIELD_VALUE_INVALID', container)];
    const intent = new Intent({...(container === 'facts' ? {schema: numberSchema} : {extensionSchema: numberSchema}), executor: controlled(() => d)});
    try {
      const r = await intent.parse({input: 'amount -1', fields: container === 'facts' ? ['amount'] : [], output: {extensions: container === 'extensions'}});
      assert.equal(r.issues.length, 1); assert.equal(r.issues[0]!.container, container); assert.equal(r.issues[0]!.code, 'FIELD_VALUE_INVALID');
    } finally {await intent.dispose();}
});

for (const malformed of ['issue-key', 'option-key', 'option-reference']) test('Coalescing cannot launder an invalid local reference: ' + malformed, async () => {
  const d = draft(); d.observations = [observation('amount', -1)]; d.issues = [claim('first', 'amount'), claim(malformed === 'issue-key' ? 'first' : 'second', 'amount')];
  if (malformed !== 'issue-key') {
    d.issues[0]!.candidates = [{key: 'x', description: 'x', intentKey: null, sources: [src]}];
    if (malformed === 'option-key') d.issues[0]!.candidates.push({...d.issues[0]!.candidates[0]!});
    else d.issues[0]!.questions = [{question: 'Select', optionKeys: ['missing']}];
  }
  const intent = new Intent({schema: numberSchema, executor: controlled(() => d)});
  try {await assert.rejects(intent.parse({input: 'amount -1', fields: ['amount']}), {code: 'MODEL_OUTPUT_INVALID'});} finally {await intent.dispose();}
});

test('A formal claim on an unexamined field cannot spend another validation or invent a result', async () => {
  const d = draft(); d.issues = [claim('unexamined', 'amount')];
  const intent = new Intent({schema: numberSchema, executor: controlled(() => d)});
  try {await assert.rejects(intent.parse({input: 'No amount requested', fields: []}), rejectsAt('/issues/0/code'));} finally {await intent.dispose();}
});

for (const mode of ['host', 'executor'] as const) test('MCP ' + mode + ' returns the same coalesced diagnostic and references', async () => {
  const d = draft(); d.observations = [observation('amount', -1)]; d.issues = [claim('one', 'amount'), claim('two', 'amount')];
  d.suggestions = [{kind: 'clarification', text: 'Correct the amount', relatesTo: ['issue:one', 'issue:two']}];
  const intent = new Intent({schema: numberSchema, executor: controlled(() => d), limits: {maxValidationChecks: 1}});
  const adapter = createIntentMcpAdapter({mode, instances: {main: intent}}), session = adapter.connect({protocolVersion: '2026-07-28'});
  const args = {input: 'amount -1', fields: ['amount'], output: {suggestions: true, diagnostics: true}};
  try {
    let reply;
    if (mode === 'host') {
      const prepared = await session.callTool('intent_runtime_prepare', args); assert(prepared && !prepared.isError);
      const task = prepared.structuredContent as unknown as HostTask;
      assert(!JSON.stringify(task.outputSchema).includes('modelKeys'));
      reply = await session.callTool('intent_runtime_accept', {requestId: task.requestId, submissionToken: task.submissionToken, candidateText: JSON.stringify(d)});
    } else reply = await session.callTool('intent_runtime_parse', args);
    assert(reply && !reply.isError, reply?.content[0]?.text); const r = reply.structuredContent as unknown as IntentResult;
    assert.equal(r.issues.length, 1); assert.deepEqual(r.suggestions![0]!.relatesTo, [r.issues[0]!.id, r.issues[0]!.id]);
    assert.equal(r.diagnostics!.modelCallCount, mode === 'host' ? 0 : 1);
    assert(!JSON.stringify(r).includes('modelKeys'));
  } finally {await adapter.close(); await intent.dispose();}
});

for (const path of ['/inputs', '/inputs/value', '/extensions', '/extensions/note', '/children/0/inputs', '/children/0/inputs/value', '/children/0/extensions', '/children/0/extensions/note']) test('Resolved business inference location is rejected: ' + path, async () => {
  const d = draft(['a', 'child']); d.nodes[1]!.parentKey = 'a';
  d.observations = ['a', 'child'].flatMap(owner => [observation('value', 1, owner), observation('note', 'supplied', owner, 'extensions')]);
  d.inferences = [{target: {kind: 'intent', key: 'a', path}, candidateJson: 'null', explanation: 'Unconfirmed', sources: [src]}];
  const intent = new Intent({schema: {type: 'object', properties: {value: {type: 'number'}}}, extensionSchema: {type: 'object', properties: {note: {type: 'string'}}}, executor: controlled(() => d)});
  try {await assert.rejects(intent.parse({input: 'Supplied values for parent and child', fields: ['value'], output: {extensions: true, evidence: false}}), rejectsAt('/inferences/0/target/path'));} finally {await intent.dispose();}
});

test('Nested semantic inference, selected-field evidence and nested delta retain separate rules', async () => {
  const d = draft(['a', 'child']); d.nodes[1]!.parentKey = 'a'; d.nodes[1]!.target = null;
  d.observations = [observation('value', 1, 'child')];
  d.inferences = [{target: {kind: 'intent', key: 'a', path: '/children/0/target'}, candidateJson: '"possible object"', explanation: 'Unconfirmed object', sources: [src]}];
  d.evidence = [{target: {kind: 'intent', key: 'a', path: '/children/0/inputs/value'}, sources: [src]}];
  d.changes[0]!.deltaHints = [{path: '/children/0/inputs/value', operation: 'set'}];
  const intent = new Intent({schema: {type: 'object', properties: {value: {type: 'number'}}}, executor: controlled(() => d)});
  try {
    const r = await intent.parse({input: 'Child has value 1 but an unconfirmed object', fields: ['value'], output: {evidence: true}});
    assert.equal(r.inferences[0]!.target, '/effective/intents/0/children/0/target');
    assert.equal(r.evidence![0]!.target, '/effective/intents/0/children/0/inputs/value');
    assert.equal(r.turn.changes[0]!.effect === 'applied' && r.turn.changes[0]!.deltas![0]!.after, 1);
    const hidden = await intent.parse({input: 'Same supplied semantic uncertainty', fields: ['value'], output: {evidence: false}});
    assert.equal(hidden.evidence, undefined); assert.equal(hidden.inferences.length, 1);
  } finally {await intent.dispose();}
});

test('Fact-root inference remains available without adopting an unconfirmed business value', async () => {
  const d = draft([]); d.kind = 'statement'; d.inferences = [{target: {kind: 'fact', key: null, path: ''}, candidateJson: '{"possible":true}', explanation: 'Unconfirmed contextual fact', sources: [src]}];
  const intent = new Intent({executor: controlled(() => d)});
  try {
    const r = await intent.parse({input: 'A possible fact, not confirmed', output: {evidence: false}});
    assert.deepEqual(r.turn.facts, {}); assert.equal(r.inferences[0]!.target, '/turn/facts'); assert.deepEqual(r.inferences[0]!.candidate, {possible: true});
  } finally {await intent.dispose();}
});
