import { randomUUID } from 'node:crypto';
import type { IntentResult, StructuredIntent, IntentConstraint, IntentRelation, IntentChange, SourceRef, JsonObject, JsonValue, StructuredExpression, ExpressionOperand } from '../contracts/public.js';
import { violation } from '../contracts/errors.js';
import { cloneJson, decodeJson } from '../internal/json.js';
import { resolve } from '../internal/pointer.js';
import { sourceValue } from '../internal/source.js';
import type { CandidateDraft, CheckedField, Locator } from '../model/candidate.js';

export function assemble(draft: CandidateDraft, materials: Record<string, unknown>, fields: CheckedField[], fieldIssues: Array<{ownerKey: string | null; issue: IntentResult['issues'][number] }>, flags: Required<import('../contracts/public.js').IntentOutputOptions>): IntentResult {
  if (draft.usedHistory && !Object.hasOwn(materials, 'context') && !Object.hasOwn(materials, 'baseline')) violation('/usedHistory', 'SOURCE_INVALID');
  const maps = { intent: new Map<string, string>(), constraint: new Map<string, string>(), relation: new Map<string, string>() };
  const old = new Map<string, Record<string, unknown>>(), objects = new Map<string, unknown>();
  const source = (refs: SourceRef[]): SourceRef[] => refs.map(ref => { sourceValue(ref, materials); return cloneJson(ref); });
  const register = (kind: keyof typeof maps, key: string, prior: SourceRef | null): void => {
    if (maps[kind].has(key)) violation('', 'DUPLICATE_ID');
    let id = `${kind}-${randomUUID()}`;
    if (prior) {
      if (!['context', 'baseline'].includes(prior.root)) violation('', 'SOURCE_INVALID');
      const value = sourceValue(prior, materials);
      if (prior.root === 'baseline') {
        const previous = value as Record<string, unknown> | null;
        if (!previous || typeof previous !== 'object' || typeof previous.id !== 'string' || kind === 'intent' && !Array.isArray(previous.children) || kind === 'constraint' && !previous.scope || kind === 'relation' && typeof previous.fromId !== 'string') violation('', 'REFERENCE_NOT_FOUND');
        id = previous.id; old.set(kind + ':' + key, previous);
      } else {
        // Free Context may describe prior intent in ordinary text or an Agent's
        // own object shape. It must not be forced into StructuredIntent first.
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          const previous = value as Record<string, unknown>;
          if (typeof previous.id === 'string' && previous.id.trim()) id = previous.id;
          old.set(kind + ':' + key, previous);
        }
      }
    }
    if ([...maps[kind].values()].includes(id)) violation('', 'DUPLICATE_ID'); maps[kind].set(key, id);
  };
  draft.nodes.forEach(n => register('intent', n.key, n.priorRef)); draft.constraints.forEach(c => register('constraint', c.key, c.priorRef)); draft.relations.forEach(r => register('relation', r.key, r.priorRef));
  draft.priorTargets.forEach(t => register(t.kind, t.key, t.priorRef));
  const id = (kind: keyof typeof maps, key: string | null): string => maps[kind].get(key ?? '') ?? violation('', 'REFERENCE_NOT_FOUND');
  const nodes = new Map<string, StructuredIntent>();
  for (const n of draft.nodes) {
    if (!n.sources.length) violation('/nodes', 'SOURCE_INVALID'); source(n.sources);
    nodes.set(n.key, { id: id('intent', n.key), domain: n.domain, action: n.action, target: n.target, goal: n.goal, understanding: n.understanding, constraints: [], inputs: {}, references: [], children: [], extensions: {}, ...(n.optional !== null ? {optional: n.optional} : {}), ...(n.expectedOutput.length ? {expectedOutput: cloneJson(n.expectedOutput)} : {}) });
    objects.set('intent:' + n.key, nodes.get(n.key));
  }
  const referenceIds = new Map<string, string>();
  for (const r of draft.references) {
    const owner = nodes.get(r.ownerKey) ?? violation('/references', 'REFERENCE_NOT_FOUND');
    const key = r.ownerKey + ':' + r.key; if (referenceIds.has(key)) violation('/references', 'DUPLICATE_ID');
    let refId = 'reference-' + randomUUID();
    if (r.priorRef) { const previous = sourceValue(r.priorRef, materials) as {id?: unknown}; if (typeof previous?.id !== 'string') violation('/references', 'REFERENCE_NOT_FOUND'); refId = previous.id; }
    if (owner.references.some(r => r.id === refId)) violation('/references', 'DUPLICATE_ID');
    referenceIds.set(key, refId);
    owner.references.push({ id: refId, kind: r.kind, ref: r.kind === 'intent' ? id('intent', r.intentKey) : r.entityRef, resolved: r.resolved, ...(r.description ? {description: r.description} : {}), ...(r.sources.length ? {sourceRefs: source(r.sources)} : {}) });
    if (r.resolved && r.entityRef === null && r.kind !== 'intent' && !r.sources.length) violation('/references', 'SOURCE_INVALID');
  }
  const operand = (o: ExpressionOperand): ExpressionOperand => {
    if (o.type === 'literal') return cloneJson(o);
    if (o.type === 'input') return { ...o, intentId: id('intent', o.intentId) };
    sourceValue(o.ref, materials); return cloneJson(o);
  };
  const expression = (e: StructuredExpression): StructuredExpression => {
    if (e.type === 'comparison') return { ...e, left: operand(e.left), right: operand(e.right) };
    if (e.type === 'not') return {type: 'not', item: expression(e.item)};
    if (!e.items.length) violation('/constraints', 'STRUCTURE'); return {type: e.type, items: e.items.map(expression)};
  };
  const constraints: IntentConstraint[] = [];
  for (const c of draft.constraints) {
    source(c.sources);
    const scope: IntentConstraint['scope'] = c.scope === 'global' ? {type: 'global'} : c.scope === 'target' ? {type: 'target', intentId: id('intent', c.ownerKey), referenceId: referenceIds.get(c.ownerKey + ':' + c.referenceKey) ?? violation('/constraints', 'REFERENCE_NOT_FOUND')} : {type: c.scope, intentId: id('intent', c.ownerKey)};
    let decoded: StructuredExpression | undefined;
    if (c.expressionJson !== null) { try { decoded = expression(decodeJson(c.expressionJson) as StructuredExpression); } catch { return violation('/constraints', 'STRUCTURE'); } }
    const constraint: IntentConstraint = {id: id('constraint', c.key), kind: c.kind, text: c.text, scope, ...(decoded ? {expression: decoded} : {})};
    objects.set('constraint:' + c.key, constraint);
    if (c.scope === 'global') constraints.push(constraint); else (nodes.get(c.ownerKey!) ?? violation('', 'REFERENCE_NOT_FOUND')).constraints.push(constraint);
  }
  const roots: StructuredIntent[] = [], rows = new Map(draft.nodes.map(n => [n.key, n]));
  for (const n of draft.nodes) {
    const seen = new Set([n.key]); let parent = n.parentKey;
    while (parent !== null) { if (seen.has(parent) || !rows.has(parent)) violation('/nodes', 'REFERENCE_NOT_FOUND'); seen.add(parent); parent = rows.get(parent)!.parentKey; }
    if (n.parentKey === null) roots.push(nodes.get(n.key)!); else nodes.get(n.parentKey)!.children.push(nodes.get(n.key)!);
  }
  const relations: IntentRelation[] = draft.relations.map(r => {
    source(r.sources); if (r.kind === 'conditional' && !r.condition) violation('/relations', 'STRUCTURE');
    const value: IntentRelation = {id: id('relation', r.key), fromId: id('intent', r.fromKey), toId: id('intent', r.toKey), kind: r.kind, ...(r.kind === 'conditional' ? {condition: r.condition!} : {})}; objects.set('relation:' + r.key, value); return value;
  });
  const result: IntentResult = {schemaVersion: '2.0-draft.6', input: materials.input as string, status: 'complete', turn: {kind: draft.kind, normalizedInput: draft.normalizedInput, intentIds: [...new Set(draft.relatedKeys.map(k => id('intent', k)))], changes: [], facts: {}}, effective: {schemaVersion: '2.0-draft.6', coverage: draft.historyCoverage, scope: draft.usedHistory ? 'provided_materials' : 'current_request', intents: roots, constraints, relations, unresolved: []}, fieldResults: [], issues: [], inferences: []};
  for (const f of fields) {
    const owner = f.ownerKey === null ? null : nodes.get(f.ownerKey) ?? violation('', 'FIELD_OWNERSHIP');
    const bag = f.container === 'facts' ? result.turn.facts : owner![f.container];
    if (f.value !== undefined && ['present', 'explicit_null'].includes(f.status)) Object.defineProperty(bag, f.field, {value: cloneJson(f.value), enumerable: true, writable: true, configurable: true});
    if (f.inherited) continue;
    result.fieldResults.push({container: f.container, intentId: owner?.id ?? null, field: f.field, path: f.path, status: f.status, trigger: f.trigger, ...(f.explanation ? {explanation: f.explanation} : {}), ...(f.rawText !== undefined ? {rawText: f.rawText} : {}), ...(f.sources.length ? {sourceRefs: source(f.sources)} : {})});
  }
  for (const c of draft.changes) {
    if (!c.sources.some(s => s.root === 'input')) violation('/changes', 'SOURCE_INVALID');
    const target = c.targetKind === 'unresolved' ? {kind: 'unresolved' as const, description: c.description} : {kind: c.targetKind, id: id(c.targetKind, c.targetKey)};
    if (c.targetKind === 'unresolved' && c.effect !== 'unresolved' || c.effect !== 'applied' && c.deltaHints.length) violation('/changes', 'SEMANTIC_INVARIANT');
    const base = {operation: c.operation, target, description: c.description, sourceRefs: source(c.sources)};
    const change: IntentChange = c.effect === 'conditional' ? {...base, effect: 'conditional', conditionId: id('constraint', c.conditionKey)} : c.effect === 'unresolved' ? {...base, effect: 'unresolved', ...(c.conditionKey ? {conditionId: id('constraint', c.conditionKey)} : {})} : {...base, effect: 'applied'};
    if (change.effect === 'applied' && c.deltaHints.length) change.deltas = c.deltaHints.map(h => {
      const previous = old.get(c.targetKind + ':' + c.targetKey), next = objects.get(c.targetKind + ':' + c.targetKey);
      const before = previous ? resolve(previous, h.path) : {found: false};
      if (h.operation === 'remove') return {path: h.path, operation: 'remove', ...(before.found ? {before: cloneJson(before.value) as JsonValue} : {})};
      const after = resolve(next, h.path); if (!after.found) violation('/changes', 'REFERENCE_NOT_FOUND');
      return {path: h.path, operation: 'set', after: cloneJson(after.value) as JsonValue, ...(before.found ? {before: cloneJson(before.value) as JsonValue} : {})};
    });
    result.turn.changes.push(change);
  }
  for (const n of draft.nodes) if (!n.priorRef && !result.turn.changes.some(c => c.effect === 'applied' && c.operation === 'add' && c.target.kind === 'intent' && c.target.id === id('intent', n.key))) violation('/changes', 'MISSING_REQUIRED');
  const locations = new Map<string, string>();
  const locate = (nodes: StructuredIntent[], path: string): void => nodes.forEach((n, i) => { const p = path + '/' + i; locations.set('intent:' + n.id, p); n.constraints.forEach((c, j) => locations.set('constraint:' + c.id, p + '/constraints/' + j)); locate(n.children, p + '/children'); });
  locate(roots, '/effective/intents'); constraints.forEach((c, i) => locations.set('constraint:' + c.id, '/effective/constraints/' + i)); relations.forEach((r, i) => locations.set('relation:' + r.id, '/effective/relations/' + i));
  const locator = (l: Locator): string => {
    const base = l.kind === 'fact' ? '/turn/facts' : locations.get(l.kind + ':' + id(l.kind, l.key));
    if (base === undefined) violation('', 'REFERENCE_NOT_FOUND'); const path = base + l.path; if (!resolve(result, path).found) violation('', 'REFERENCE_NOT_FOUND'); return path;
  };
  for (const q of draft.issues) result.issues.push({id: 'issue-' + q.key, code: q.code, category: q.category, message: q.message, ...(q.ownerKey ? {intentId: id('intent', q.ownerKey)} : {}), ...(q.sources.length ? {sourceRefs: source(q.sources)} : {}), ...(q.candidates.length ? {candidates: q.candidates.map(c => ({id: c.key, description: c.description, sourceRefs: source(c.sources), ...(c.intentKey ? {intentId: id('intent', c.intentKey)} : {})}))} : {}), ...(q.questions.length ? {questions: q.questions.map(x => ({question: x.question, ...(x.optionKeys.length ? {optionIds: x.optionKeys} : {})}))} : {})});
  for (const f of fieldIssues) result.issues.push({...f.issue, ...(f.ownerKey ? {intentId: id('intent', f.ownerKey)} : {})});
  for (const n of nodes.values()) if (n.understanding !== 'clear' && !result.issues.some(q => q.intentId === n.id && q.category !== 'data')) result.issues.push({id: 'understanding-' + n.id, code: n.understanding === 'ambiguous' ? 'AMBIGUOUS_REFERENCE' : n.understanding === 'conflicted' ? 'CONSTRAINT_CONFLICT' : 'INTENT_INFORMATION_MISSING', category: n.understanding === 'conflicted' ? 'conflict' : n.understanding === 'ambiguous' ? 'ambiguity' : 'missing', message: 'The supplied material leaves this intent unresolved.', intentId: n.id});
  const beforeEdges = relations.filter(r => r.kind === 'before');
  const reaches = (from: string, target: string, seen = new Set<string>()): boolean => {
    if (seen.has(from)) return false; seen.add(from);
    return beforeEdges.filter(r => r.fromId === from).some(r => r.toId === target || reaches(r.toId, target, seen));
  };
  const conflicted = [...nodes.keys()].filter(key => reaches(id('intent', key), id('intent', key)));
  if (conflicted.length && !result.issues.some(q => q.code === 'RELATION_CONFLICT')) {
    result.issues.push({id: 'relation-conflict', code: 'RELATION_CONFLICT', category: 'conflict', message: 'The user-stated strict ordering requirements conflict.'});
    conflicted.forEach(key => {nodes.get(key)!.understanding = 'conflicted';});
  }
  for (const inference of draft.inferences) result.inferences.push({target: locator(inference.target), explanation: inference.explanation, sourceRefs: source(inference.sources), ...(inference.candidateJson === null ? {} : {candidate: decodeJson(inference.candidateJson)})});
  if (flags.evidence) result.evidence = draft.evidence.map(e => ({target: locator(e.target), sourceRefs: source(e.sources)}));
  if (flags.suggestions) result.suggestions = cloneJson(draft.suggestions);
  const semantic = result.issues.filter(q => q.category !== 'data');
  const currentProblems = semantic.filter(q => q.code !== 'CONTEXT_INCOMPLETE');
  if (draft.kind === 'unclear' || currentProblems.length || draft.changes.some(c => c.effect === 'unresolved') || draft.relatedKeys.some(k => nodes.get(k)!.understanding !== 'clear')) result.status = 'partial';
  result.effective.unresolved = semantic.map(q => q.message);
  if (semantic.length) result.effective.coverage = 'partial';
  return result;
}
