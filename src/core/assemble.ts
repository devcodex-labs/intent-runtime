import { randomUUID } from 'node:crypto';
import type { IntentResult, StructuredIntent, IntentConstraint, IntentRelation, IntentChange, IntentDelta, SourceRef, JsonObject, JsonValue, StructuredExpression, ExpressionOperand } from '../contracts/public.js';
import { IntentError, violation, isTechnicalErrorCode } from '../contracts/errors.js';
import { cloneJson, decodeJson, measure, equalJson } from '../internal/json.js';
import { resolve, tokens } from '../internal/pointer.js';
import { sourceValue } from '../internal/source.js';
import type { CandidateDraft, CheckedField, Locator } from '../model/candidate.js';

export function assemble(draft: CandidateDraft, materials: Record<string, unknown>, fields: CheckedField[], fieldIssues: Array<{ownerKey: string | null; issue: IntentResult['issues'][number] }>, flags: Required<import('../contracts/public.js').IntentOutputOptions>, options: {expressions: Map<string, StructuredExpression>; inputPaths: Set<string>; maxBytes: number; maxDepth: number}): IntentResult {
  // Safe candidate locations, without source contents. Run at the assembly
  // boundary so all business checks already used still count for correction.
  let usedProvidedMaterials = false;
  const inspectSources = (entry: {sources?: SourceRef[]; priorRef?: SourceRef | null}, path: string): void => {
    entry.sources?.forEach((ref, i) => {sourceValue(ref, materials, path + '/sources/' + i); usedProvidedMaterials ||= ['context', 'baseline'].includes(ref.root);});
    if (entry.priorRef) {
      if (!['context', 'baseline'].includes(entry.priorRef.root)) violation(path + '/priorRef/root', 'SOURCE_INVALID');
      sourceValue(entry.priorRef, materials, path + '/priorRef');
      usedProvidedMaterials = true;
    }
  };
  for (const [name, entries] of Object.entries({nodes: draft.nodes, constraints: draft.constraints, references: draft.references, relations: draft.relations, priorTargets: draft.priorTargets, changes: draft.changes, issues: draft.issues, inferences: draft.inferences, evidence: draft.evidence})) entries.forEach((entry, i) => inspectSources(entry, '/' + name + '/' + i));
  draft.issues.forEach((issue, i) => issue.candidates.forEach((candidate, j) => inspectSources(candidate, '/issues/' + i + '/candidates/' + j)));
  usedProvidedMaterials ||= fields.some(field => field.usedProvidedMaterials || field.sources.some(ref => ['context', 'baseline'].includes(ref.root)));
  const usesHistory = (e: StructuredExpression): boolean => e.type === 'comparison'
    ? [e.left, e.right].some(o => o.type === 'source' && ['context', 'baseline'].includes(o.ref.root))
    : e.type === 'not' ? usesHistory(e.item) : e.items.some(usesHistory);
  usedProvidedMaterials ||= [...options.expressions.values()].some(usesHistory);
  if (usedProvidedMaterials && !draft.usedHistory) violation('/usedHistory', 'SEMANTIC_INVARIANT');
  for (const q of draft.issues) if (q.code === 'PROCESSING_INCOMPLETE' || isTechnicalErrorCode(q.code)) violation('/issues', 'SEMANTIC_INVARIANT');
  if (draft.usedHistory && !Object.hasOwn(materials, 'context') && !Object.hasOwn(materials, 'baseline')) violation('/usedHistory', 'SOURCE_INVALID');
  const maps = { intent: new Map<string, string>(), constraint: new Map<string, string>(), relation: new Map<string, string>() };
  const old = new Map<string, Record<string, unknown>>(), objects = new Map<string, unknown>();
  const source = (refs: SourceRef[]): SourceRef[] => refs.map(ref => { sourceValue(ref, materials); return cloneJson(ref); });
  const register = (kind: keyof typeof maps, key: string, prior: SourceRef | null, path: string): void => {
    if (!key.trim()) violation(path + '/key', 'MISSING_REQUIRED');
    if (maps[kind].has(key)) violation(path + '/key', 'DUPLICATE_ID');
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
    if ([...maps[kind].values()].includes(id)) violation(path + '/priorRef', 'DUPLICATE_ID'); maps[kind].set(key, id);
  };
  draft.nodes.forEach((n, i) => register('intent', n.key, n.priorRef, '/nodes/' + i)); draft.constraints.forEach((c, i) => register('constraint', c.key, c.priorRef, '/constraints/' + i)); draft.relations.forEach((r, i) => register('relation', r.key, r.priorRef, '/relations/' + i));
  draft.priorTargets.forEach((t, i) => register(t.kind, t.key, t.priorRef, '/priorTargets/' + i));
  const id = (kind: keyof typeof maps, key: string | null, path = ''): string => key === null ? violation(path, 'REFERENCE_NOT_FOUND') : maps[kind].get(key) ?? violation(path, 'REFERENCE_NOT_FOUND');
  const nodes = new Map<string, StructuredIntent>();
  for (const n of draft.nodes) {
    if (!n.sources.length) violation('/nodes', 'SOURCE_INVALID'); source(n.sources);
    nodes.set(n.key, { id: id('intent', n.key), domain: n.domain, action: n.action, target: n.target, goal: n.goal, understanding: n.understanding, constraints: [], inputs: {}, references: [], children: [], extensions: {}, ...(n.optional !== null ? {optional: n.optional} : {}), ...(n.expectedOutput.length ? {expectedOutput: cloneJson(n.expectedOutput)} : {}) });
    objects.set('intent:' + n.key, nodes.get(n.key));
  }
  const referenceIds = new Map<string, string>();
  for (const [i, r] of draft.references.entries()) {
    const path = '/references/' + i;
    const owner = nodes.get(r.ownerKey) ?? violation(path + '/ownerKey', 'REFERENCE_NOT_FOUND');
    const key = JSON.stringify([r.ownerKey, r.key]); if (referenceIds.has(key)) violation('/references', 'DUPLICATE_ID');
    let refId = 'reference-' + randomUUID();
    if (r.priorRef) { const previous = sourceValue(r.priorRef, materials) as {id?: unknown}; if (typeof previous?.id !== 'string') violation('/references', 'REFERENCE_NOT_FOUND'); refId = previous.id; }
    if (owner.references.some(r => r.id === refId)) violation('/references', 'DUPLICATE_ID');
    referenceIds.set(key, refId);
    owner.references.push({ id: refId, kind: r.kind, ref: r.kind === 'intent' ? id('intent', r.intentKey, path + '/intentKey') : r.entityRef, resolved: r.resolved, ...(r.description ? {description: r.description} : {}), ...(r.sources.length ? {sourceRefs: source(r.sources)} : {}) });
    if (r.resolved && r.entityRef === null && r.kind !== 'intent' && !r.sources.length) violation('/references', 'SOURCE_INVALID');
  }
  const operand = (o: ExpressionOperand): ExpressionOperand => {
    if (o.type === 'literal') return cloneJson(o);
    if (o.type === 'input') {
      if (!nodes.has(o.intentId)) violation('/constraints', 'REFERENCE_NOT_FOUND');
      if (!options.inputPaths.has(JSON.stringify([o.intentId, o.path]))) violation('/constraints', 'REFERENCE_NOT_FOUND');
      return { ...o, intentId: id('intent', o.intentId) };
    }
    sourceValue(o.ref, materials); return cloneJson(o);
  };
  const expression = (e: StructuredExpression): StructuredExpression => {
    if (e.type === 'comparison') return { ...e, left: operand(e.left), right: operand(e.right) };
    if (e.type === 'not') return {type: 'not', item: expression(e.item)};
    if (!e.items.length) violation('/constraints', 'STRUCTURE'); return {type: e.type, items: e.items.map(expression)};
  };
  const constraints: IntentConstraint[] = [];
  for (const [i, c] of draft.constraints.entries()) {
    source(c.sources);
    const path = '/constraints/' + i;
    // Scope errors need the original candidate slot so a host can correct the
    // reference without guessing at a root-level validation failure.
    if (c.scope !== 'global' && (c.ownerKey === null || !nodes.has(c.ownerKey))) violation(path + '/ownerKey', 'REFERENCE_NOT_FOUND');
    const scope: IntentConstraint['scope'] = c.scope === 'global' ? {type: 'global'} : c.scope === 'target' ? {type: 'target', intentId: id('intent', c.ownerKey, path + '/ownerKey'), referenceId: referenceIds.get(JSON.stringify([c.ownerKey, c.referenceKey])) ?? violation(path + '/referenceKey', 'REFERENCE_NOT_FOUND')} : {type: c.scope, intentId: id('intent', c.ownerKey, path + '/ownerKey')};
    let decoded: StructuredExpression | undefined;
    if (c.expressionJson !== null) {
      const raw = options.expressions.get(c.key) ?? violation('/constraints', 'STRUCTURE');
      decoded = expression(raw);
    }
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
  const admit = () => measure(result, {maxBytes: options.maxBytes, maxDepth: options.maxDepth, limit: 'maxOutputBytes', stage: 'output'});
  for (const f of fields) {
    const owner = f.ownerKey === null ? null : nodes.get(f.ownerKey) ?? violation('', 'FIELD_OWNERSHIP');
    const bag = f.container === 'facts' ? result.turn.facts : owner![f.container];
    if (f.value !== undefined && ['present', 'explicit_null'].includes(f.status)) Object.defineProperty(bag, f.field, {value: cloneJson(f.value), enumerable: true, writable: true, configurable: true});
    if (f.inherited) continue;
    result.fieldResults.push({container: f.container, intentId: owner?.id ?? null, field: f.field, path: f.path, status: f.status, trigger: f.trigger, ...(f.explanation ? {explanation: f.explanation} : {}), ...(f.rawText !== undefined ? {rawText: f.rawText} : {}), ...(f.sources.length ? {sourceRefs: source(f.sources)} : {})});
  }
  // Bound the assembled tree before recursive location/shape work and before
  // delta hints can duplicate whole subtrees into the result.
  admit();
  for (const c of draft.changes) {
    if (!c.sources.some(s => s.root === 'input')) violation('/changes', 'SOURCE_INVALID');
    const target = c.targetKind === 'unresolved' ? {kind: 'unresolved' as const, description: c.description} : {kind: c.targetKind, id: id(c.targetKind, c.targetKey)};
    if (c.targetKind === 'unresolved' && c.effect !== 'unresolved' || c.effect !== 'applied' && c.deltaHints.length) violation('/changes', 'SEMANTIC_INVARIANT');
    const base = {operation: c.operation, target, description: c.description, sourceRefs: source(c.sources)};
    const change: IntentChange = c.effect === 'conditional' ? {...base, effect: 'conditional', conditionId: id('constraint', c.conditionKey)} : c.effect === 'unresolved' ? {...base, effect: 'unresolved', ...(c.conditionKey ? {conditionId: id('constraint', c.conditionKey)} : {})} : {...base, effect: 'applied'};
    result.turn.changes.push(change);
    if (change.effect === 'applied' && c.deltaHints.length) {
      const deltas: IntentDelta[] = []; change.deltas = deltas;
      for (const h of c.deltaHints) {
      const previous = old.get(c.targetKind + ':' + c.targetKey), next = objects.get(c.targetKind + ':' + c.targetKey);
      const before = previous ? resolve(previous, h.path) : {found: false};
      let delta: IntentDelta;
      if (h.operation === 'remove') {
        if (next !== undefined && resolve(next, h.path).found) {
          // Removing an array member shifts subsequent members into its path.
          // Compare typed object identities, or the exact literal-array removal,
          // rather than demanding that the reused index disappear.
          const parts = tokens(h.path), index = parts.pop()!, parentPath = '/' + parts.map(p => p.replaceAll('~', '~0').replaceAll('/', '~1')).join('/');
          const previousParent = previous ? resolve(previous, parentPath) : {found: false}, nextParent = resolve(next, parentPath);
          const oldArray = previousParent.found && Array.isArray(previousParent.value) ? previousParent.value : undefined;
          const newArray = nextParent.found && Array.isArray(nextParent.value) ? nextParent.value : undefined;
          const position = /^(0|[1-9][0-9]*)$/.test(index) ? Number(index) : -1;
          const semanticCollection = c.targetKind === 'intent' && /^(?:children\/[0-9]+\/)*(?:references|children|constraints)$/.test(parts.join('/'));
          const previousId = before.found && before.value && typeof before.value === 'object' && !Array.isArray(before.value) ? (before.value as {id?: unknown}).id : undefined;
          const typedRemoval = semanticCollection && typeof previousId === 'string' && newArray && !newArray.some(value => value && typeof value === 'object' && value.id === previousId);
          const literalRemoval = oldArray && newArray && position >= 0 && position < oldArray.length && equalJson(newArray, [...oldArray.slice(0, position), ...oldArray.slice(position + 1)]);
          if (!typedRemoval && !literalRemoval) violation('/changes', 'SEMANTIC_INVARIANT');
        }
        delta = {path: h.path, operation: 'remove', ...(before.found ? {before: before.value as JsonValue} : {})};
      } else {
        const after = resolve(next, h.path); if (!after.found) violation('/changes', 'REFERENCE_NOT_FOUND');
        delta = {path: h.path, operation: 'set', after: after.value as JsonValue, ...(before.found ? {before: before.value as JsonValue} : {})};
      }
      // Measure shared references by expanded JSON cost BEFORE cloning them.
      deltas.push(delta); admit(); deltas[deltas.length - 1] = cloneJson(delta);
      }
    }
    admit();
  }
  for (const n of draft.nodes) if (!n.priorRef && !result.turn.changes.some(c => c.effect === 'applied' && c.operation === 'add' && c.target.kind === 'intent' && c.target.id === id('intent', n.key))) violation('/changes', 'MISSING_REQUIRED');
  const locations = new Map<string, string>();
  const locate = (nodes: StructuredIntent[], path: string): void => nodes.forEach((n, i) => { const p = path + '/' + i; locations.set('intent:' + n.id, p); n.constraints.forEach((c, j) => locations.set('constraint:' + c.id, p + '/constraints/' + j)); locate(n.children, p + '/children'); });
  locate(roots, '/effective/intents'); constraints.forEach((c, i) => locations.set('constraint:' + c.id, '/effective/constraints/' + i)); relations.forEach((r, i) => locations.set('relation:' + r.id, '/effective/relations/' + i));
  const locator = (l: Locator, candidatePath = ''): string => {
    try {tokens(l.path);} catch {return violation(candidatePath + '/path', 'STRUCTURE');}
    const base = l.kind === 'fact' ? '/turn/facts' : locations.get(l.kind + ':' + id(l.kind, l.key, candidatePath + '/key'));
    if (base === undefined) violation(candidatePath + '/key', 'REFERENCE_NOT_FOUND'); const path = base + l.path; if (!resolve(result, path).found) violation(candidatePath + '/path', 'REFERENCE_NOT_FOUND'); return path;
  };
  for (const q of draft.issues) result.issues.push({id: 'issue-' + q.key, code: q.code, category: q.category, message: q.message, ...(q.fieldTarget ? q.fieldTarget : {}), ...(q.ownerKey ? {intentId: id('intent', q.ownerKey)} : {}), ...(q.sources.length ? {sourceRefs: source(q.sources)} : {}), ...(q.candidates.length ? {candidates: q.candidates.map(c => ({id: c.key, description: c.description, sourceRefs: source(c.sources), ...(c.intentKey ? {intentId: id('intent', c.intentKey)} : {})}))} : {}), ...(q.questions.length ? {questions: q.questions.map(x => ({question: x.question, ...(x.optionKeys.length ? {optionIds: x.optionKeys} : {})}))} : {})});
  for (const [index, change] of result.turn.changes.entries()) if (change.effect === 'unresolved' && !result.issues.some(issue => issue.category !== 'data' && (issue.message === change.description || change.target.kind === 'intent' && issue.intentId === change.target.id && ['ambiguity', 'missing', 'conflict'].includes(issue.category)))) {
    result.issues.push({id: 'unresolved-change-' + index, code: 'AMBIGUOUS_REFERENCE', category: 'ambiguity', message: change.description, sourceRefs: cloneJson(change.sourceRefs), ...(change.target.kind === 'intent' && nodes.has(draft.changes[index]!.targetKey!) ? {intentId: change.target.id} : {})});
  }
  for (const f of fieldIssues) result.issues.push({...f.issue, ...(f.ownerKey ? {intentId: id('intent', f.ownerKey)} : {})});
  const beforeEdges = relations.filter(r => r.kind === 'before');
  const reaches = (from: string, target: string, seen = new Set<string>()): boolean => {
    if (seen.has(from)) return false; seen.add(from);
    return beforeEdges.filter(r => r.fromId === from).some(r => r.toId === target || reaches(r.toId, target, seen));
  };
  const conflicted = [...nodes.keys()].filter(key => reaches(id('intent', key), id('intent', key)));
  if (conflicted.length && !result.issues.some(q => q.code === 'RELATION_CONFLICT')) {
    result.issues.push({id: 'relation-conflict', code: 'RELATION_CONFLICT', category: 'conflict', message: draft.messages.relationConflict});
  }
  const cycleIds = new Set(conflicted.map(key => id('intent', key)));
  conflicted.forEach(key => {nodes.get(key)!.understanding = 'conflicted';});
  // A detected relation cycle already explains its endpoints. Do not fabricate
  // unrelated constraint conflicts merely because the issue is root-scoped.
  for (const n of nodes.values()) if (n.understanding !== 'clear' && !cycleIds.has(n.id) && !result.issues.some(q => q.intentId === n.id && q.category !== 'data')) result.issues.push({id: 'understanding-' + n.id, code: n.understanding === 'ambiguous' ? 'AMBIGUOUS_REFERENCE' : n.understanding === 'conflicted' ? 'CONSTRAINT_CONFLICT' : 'INTENT_INFORMATION_MISSING', category: n.understanding === 'conflicted' ? 'conflict' : n.understanding === 'ambiguous' ? 'ambiguity' : 'missing', message: draft.messages.unresolved, intentId: n.id});
  for (const [index, inference] of draft.inferences.entries()) {
    const target = locator(inference.target, '/inferences/' + index + '/target');
    const parts = tokens(inference.target.path);
    // Inputs, facts and extensions are authoritative extracted values. An
    // explicitly unconfirmed candidate belongs in inference metadata instead.
    if (inference.target.kind === 'fact' && parts.length || inference.target.kind === 'intent' && ['inputs', 'extensions'].includes(parts[0] ?? '') && parts.length > 1) violation('/inferences/' + index + '/target/path', 'SEMANTIC_INVARIANT');
    let candidate;
    if (inference.candidateJson !== null) {
      try {candidate = decodeJson(inference.candidateJson, options.maxDepth);}
      catch (cause) {if (cause instanceof IntentError) throw cause; return violation('/inferences', 'STRUCTURE');}
      measure(candidate, {maxBytes: options.maxBytes, maxDepth: options.maxDepth, limit: 'maxOutputBytes', stage: 'validation', invalid: 'MODEL_OUTPUT_INVALID'});
    }
    result.inferences.push({target, explanation: inference.explanation, sourceRefs: source(inference.sources), ...(candidate === undefined ? {} : {candidate})});
  }
  const evidence = draft.evidence.map((e, i) => ({target: locator(e.target, '/evidence/' + i + '/target'), sourceRefs: source(e.sources)}));
  if (flags.evidence) result.evidence = evidence;
  const issueIds = new Map(draft.issues.map(issue => [issue.key, 'issue-' + issue.key]));
  const suggestionIdentity = (key: string): string => {
    const candidates = new Set<string>();
    const intentKey = key.startsWith('intent:') ? key.slice(7) : key;
    const issueKey = key.startsWith('issue:') ? key.slice(6) : key;
    if (!key.startsWith('issue:') && nodes.has(intentKey)) candidates.add(id('intent', intentKey));
    if (!key.startsWith('intent:') && issueIds.has(issueKey)) candidates.add(issueIds.get(issueKey)!);
    if (candidates.size !== 1) violation('/suggestions', 'REFERENCE_NOT_FOUND');
    return [...candidates][0]!;
  };
  const suggestions = draft.suggestions.map(suggestion => ({...suggestion, relatesTo: suggestion.relatesTo.map(suggestionIdentity)}));
  if (flags.suggestions) result.suggestions = suggestions;
  const semantic = result.issues.filter(q => q.category !== 'data');
  const currentProblems = semantic.filter(q => q.code !== 'CONTEXT_INCOMPLETE');
  if (draft.kind === 'unclear' || currentProblems.length || draft.changes.some(c => c.effect === 'unresolved') || draft.relatedKeys.some(k => nodes.get(k)!.understanding !== 'clear')) result.status = 'partial';
  result.effective.unresolved = semantic.map(q => q.message);
  if (semantic.length) result.effective.coverage = 'partial';
  admit();
  return result;
}
