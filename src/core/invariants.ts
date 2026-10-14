import type { IntentResult, StructuredIntent, IntentConstraint } from '../contracts/public.js';
import type { CandidateDraft } from '../model/candidate.js';
import { violation } from '../contracts/errors.js';
import { tokens } from '../internal/pointer.js';

export function invariants(result: IntentResult, draft: CandidateDraft): void {
  const nodes = new Map<string, StructuredIntent>(), constraints = new Map<string, IntentConstraint>(), relations = new Set<string>();
  const putConstraint = (c: IntentConstraint): void => {if (constraints.has(c.id)) violation('', 'DUPLICATE_ID'); constraints.set(c.id, c);};
  const visit = (tree: StructuredIntent[]): void => {
    for (const n of tree) {
      if (nodes.has(n.id)) violation('/effective/intents', 'DUPLICATE_ID'); nodes.set(n.id, n);
      n.constraints.forEach(putConstraint); const refs = new Set<string>();
      for (const r of n.references) {if (refs.has(r.id)) violation('/effective/intents', 'DUPLICATE_ID'); refs.add(r.id);}
      visit(n.children);
    }
  };
  visit(result.effective.intents); result.effective.constraints.forEach(putConstraint);
  for (const c of constraints.values()) {
    if (c.scope.type !== 'global') {
      const node = nodes.get(c.scope.intentId); if (!node) violation('', 'REFERENCE_NOT_FOUND');
      const scope = c.scope;
      if (scope.type === 'target' && !node.references.some(r => r.id === scope.referenceId)) violation('', 'REFERENCE_NOT_FOUND');
    }
  }
  for (const n of nodes.values()) for (const r of n.references) if (r.kind === 'intent' && !nodes.has(r.ref!)) violation('', 'REFERENCE_NOT_FOUND');
  for (const r of result.effective.relations) {if (relations.has(r.id)) violation('', 'DUPLICATE_ID'); relations.add(r.id); if (!nodes.has(r.fromId) || !nodes.has(r.toId)) violation('', 'REFERENCE_NOT_FOUND');}
  for (const id of result.turn.intentIds) if (!nodes.has(id)) violation('/turn/intentIds', 'REFERENCE_NOT_FOUND');
  // Withdrawal describes removal of a prior intent. Constraint removal is an
  // amendment (EX-15); a newly requested business cancellation is request
  // behavior (CL-15), rather than removal of a recognition goal.
  if (result.turn.kind === 'withdrawal' && result.turn.changes.length && !result.turn.changes.some(c => c.operation === 'withdraw' && (c.target.kind === 'intent' && c.effect !== 'conditional' || c.target.kind === 'unresolved' && c.effect === 'unresolved'))) violation('/kind', 'SEMANTIC_INVARIANT');
  for (const c of result.turn.changes) {
    const active = c.target.kind === 'intent' ? nodes.has(c.target.id) : c.target.kind === 'constraint' ? constraints.has(c.target.id) : c.target.kind === 'relation' ? relations.has(c.target.id) : false;
    if (c.effect === 'conditional' && !constraints.has(c.conditionId)) violation('/turn/changes', 'REFERENCE_NOT_FOUND');
    if (c.effect === 'applied' && c.operation === 'add' && !active || c.effect === 'applied' && c.operation === 'withdraw' && active) violation('/turn/changes', 'SEMANTIC_INVARIANT');
    if (c.effect === 'applied' && c.operation !== 'withdraw' && !active) violation('/turn/changes', 'REFERENCE_NOT_FOUND');
    // An active current change must be visible in this turn's references.
    // Withdrawn objects remain in changes only, never in turn.intentIds.
    if (c.target.kind === 'intent' && active && !result.turn.intentIds.includes(c.target.id)) violation('/relatedKeys', 'SEMANTIC_INVARIANT');
    if (c.effect === 'applied') c.deltas?.forEach(d => tokens(d.path));
  }
  const added = result.turn.changes.filter(c => c.operation === 'add' && c.effect === 'applied' && c.target.kind === 'intent').map(c => c.target.kind === 'intent' ? c.target.id : '');
  if (new Set(added).size !== draft.nodes.filter(x => !x.priorRef).length) violation('/turn/changes', 'MISSING_REQUIRED');
  const fields = new Set<string>();
  for (const f of result.fieldResults) {
    const key = JSON.stringify([f.container, f.intentId, f.path]); if (fields.has(key)) violation('/fieldResults', 'DUPLICATE_ID'); fields.add(key);
    if (f.status !== 'present' && !f.explanation) violation('/fieldResults', 'MISSING_REQUIRED');
    if (f.container === 'facts' && f.intentId !== null || f.container !== 'facts' && !nodes.has(f.intentId!)) violation('/fieldResults', 'FIELD_OWNERSHIP');
  }
  const issueIds = new Set<string>();
  for (const issue of result.issues) {
    if (issueIds.has(issue.id)) violation('/issues', 'DUPLICATE_ID'); issueIds.add(issue.id);
    if (issue.intentId && !nodes.has(issue.intentId)) violation('/issues', 'REFERENCE_NOT_FOUND');
    const candidates = new Set((issue.candidates ?? []).map(c => c.id));
    if (candidates.size !== (issue.candidates ?? []).length) violation('/issues', 'DUPLICATE_ID');
    if (issue.candidates?.some(candidate => candidate.intentId && !nodes.has(candidate.intentId))) violation('/issues', 'REFERENCE_NOT_FOUND');
    if (issue.questions?.some(q => q.optionIds?.some(id => !candidates.has(id)))) violation('/issues', 'REFERENCE_NOT_FOUND');
  }
}
