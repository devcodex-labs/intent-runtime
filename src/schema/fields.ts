import type { IntentIssue, JsonObject, JsonValue, SourceRef } from '../contracts/public.js';
import { IntentError, violation } from '../contracts/errors.js';
import type { CandidateDraft, CheckedField, Observation, NodeDraft } from '../model/candidate.js';
import { cloneJson, decodeJson, equalJson, measure, plain } from '../internal/json.js';
import { tokens, escapeToken } from '../internal/pointer.js';
import { sourceValue } from '../internal/source.js';
import { Definition } from './compile.js';
import { ABSENT, BusinessValidator, classify, ValidationBudget, type Verdict } from './validate.js';

export function checkFields(draft: CandidateDraft, materials: Record<string, unknown>, schema: Definition | undefined, extension: Definition | undefined, selection: string[], outputExtensions: boolean, validator: BusinessValidator, budget: ValidationBudget, maxBytes: number, maxDepth: number): {values: CheckedField[]; issues: Array<{ownerKey: string | null; issue: IntentIssue}>} {
  const messages = draft.messages;
  if (Object.values(messages).some(v => !v.trim())) violation('/messages', 'STRUCTURE');
  const values: CheckedField[] = [], issues: Array<{ownerKey: string | null; issue: IntentIssue}> = [];
  for (const [i, o] of draft.observations.entries()) {
    const spec = o.container === 'extensions' ? extension : schema;
    const owner = draft.nodes.find(n => n.key === o.ownerKey);
    const prior = owner?.priorRef ? sourceValue(owner.priorRef, materials) : undefined;
    const priorBag = prior && typeof prior === 'object' ? (prior as Record<string, unknown>)[o.container] : undefined;
    const oldField = plain(priorBag) && Object.hasOwn(priorBag, o.field);
    if ((!spec?.hasPath([o.field]) && !oldField) || o.container === 'facts' && (o.ownerKey !== null || draft.nodes.length) || o.container !== 'facts' && !owner) violation('/observations/' + i, 'FIELD_OWNERSHIP');
    if (o.presence === 'known' && (!o.sources.length || o.valueJson === null)) violation('/observations/' + i, 'SOURCE_INVALID');
    if (['known', 'present_unknown', 'absent'].includes(o.presence) && !o.sources.some(s => ['input', 'context', 'baseline'].includes(s.root))) violation('/observations/' + i, 'SOURCE_INVALID');
    o.sources.forEach(s => sourceValue(s, materials));
    if (o.semantic) {
      if (!o.semantic.explanation.trim() || !o.semantic.sources.length) violation('/observations/' + i + '/semantic', 'SOURCE_INVALID');
      o.semantic.sources.forEach(s => sourceValue(s, materials));
      if (!o.semantic.sources.some(s => ['input', 'context', 'baseline'].includes(s.root))) violation('/observations/' + i + '/semantic', 'SOURCE_INVALID');
      if (new Set(o.semantic.dependencies.map(d => d.field)).size !== o.semantic.dependencies.length || o.semantic.dependencies.some(d => !spec?.hasPath([d.field]))) violation('/observations/' + i + '/semantic', 'REFERENCE_NOT_FOUND');
    }
  }
  for (const [i, q] of draft.issues.entries()) {
    if (q.code.startsWith('FIELD_') && !q.fieldTarget) violation('/issues/' + i, 'FIELD_OWNERSHIP');
    if (!q.fieldTarget) continue;
    const t = q.fieldTarget, spec = t.container === 'extensions' ? extension : schema;
    const prefix = '/' + escapeToken(t.field);
    if (q.category !== 'data' || !['FIELD_VALUE_INVALID', 'FIELD_CARDINALITY_MISMATCH', 'FIELD_DEPENDENCY_MISSING', 'FIELD_APPLICABILITY_UNKNOWN', 'FIELD_REQUIRED_MISSING', 'FIELD_VALIDATION_UNDETERMINED'].includes(q.code) || !spec?.fields.includes(t.field) || (t.container === 'facts' ? q.ownerKey !== null || draft.nodes.length : !draft.nodes.some(n => n.key === q.ownerKey)) || !(t.path === prefix || t.path.startsWith(prefix + '/'))) violation('/issues/' + i, 'FIELD_OWNERSHIP');
    try {tokens(t.path);} catch {violation('/issues/' + i, 'STRUCTURE');}
    q.sources.forEach(s => sourceValue(s, materials));
    if (!q.sources.some(s => ['input', 'context', 'baseline'].includes(s.root))) violation('/issues/' + i, 'SOURCE_INVALID');
  }
  const scopes: Array<{owner: NodeDraft | null; container: Observation['container']; spec: Definition | undefined; selected: string[]}> = draft.nodes.flatMap(n => [
    { owner: n, container: 'inputs' as const, spec: schema, selected: selection },
    { owner: n, container: 'extensions' as const, spec: extension, selected: outputExtensions ? extension!.fields : [] },
  ]);
  if (!draft.nodes.length) scopes.push({owner: null, container: 'facts', spec: schema, selected: selection});
  for (const scope of scopes) {
    const key = scope.owner?.key ?? null, container = scope.container as Observation['container'];
    const previous = scope.owner?.priorRef ? sourceValue(scope.owner.priorRef, materials) as Record<string, unknown> : undefined;
    const priorValues = previous?.[container];
    const inherited = (plain(priorValues) ? priorValues : {}) as JsonObject;
    const observations = draft.observations.filter(o => o.ownerKey === key && o.container === container), current = new Map<string, Observation>();
    const directory = [...new Set([...Object.keys(inherited), ...observations.map(o => o.field)])];
    const known: Record<string, unknown> = cloneJson(inherited), changed = new Set<string>();
    for (const o of observations) {
      if (current.has(o.field)) violation('/observations', 'DUPLICATE_ID'); current.set(o.field, o);
      if (o.presence === 'known') {
        let value: JsonValue; try { value = decodeJson(o.valueJson!, maxDepth); } catch (cause) { if (cause instanceof IntentError) throw cause; return violation('/observations', 'STRUCTURE'); }
        measure(value, {maxBytes, maxDepth, limit: 'maxOutputBytes', stage: 'validation', invalid: 'MODEL_OUTPUT_INVALID'});
        Object.defineProperty(known, o.field, {value, enumerable: true, configurable: true, writable: true});
        // A dependency may have been used internally last turn without being
        // selected into baseline.inputs. New evidence still changes its known
        // binding and must recheck old dependent values.
        if (!Object.hasOwn(inherited, o.field) || !equalJson(value, inherited[o.field])) changed.add(o.field);
      } else if (['absent', 'unknown', 'present_unknown', 'not_applicable'].includes(o.presence)) {
        if (Object.hasOwn(inherited, o.field)) changed.add(o.field); delete known[o.field];
      }
    }
    const checks = new Set(scope.selected);
    for (const field of Object.keys(inherited)) if (changed.has(field) || scope.spec?.fields.includes(field) && changed.size && [...scope.spec.plan(field, directory).reads, ...observations.filter(o => o.field === field).flatMap(o => o.semantic?.dependencies.map(d => d.field) ?? [])].some(f => changed.has(f))) checks.add(field);
    for (const field of Object.keys(inherited)) if (!checks.has(field)) values.push({ownerKey: key, container, field, path: '/' + escapeToken(field), status: inherited[field] === null ? 'explicit_null' : 'present', trigger: 'selection', value: inherited[field]!, sources: [], inherited: true});
    for (const field of checks) {
      const selected = scope.selected.includes(field), observation = current.get(field), path = '/' + escapeToken(field);
      const oldSource: SourceRef[] = scope.owner?.priorRef && Object.hasOwn(inherited, field) ? [{root: scope.owner.priorRef.root, pointer: scope.owner.priorRef.pointer + '/' + container + path}] : [];
      const sources = observation?.sources.length ? observation.sources : oldSource;
      let status: CheckedField['status'], code: string | undefined, explanation: string | undefined, value: JsonValue | undefined, verdict: Verdict | undefined;
      const trigger = selected ? 'selection' : 'invalidation';
      const semanticIssue = draft.issues.find(q => q.ownerKey === key && q.fieldTarget?.container === container && q.fieldTarget.field === field);
      const semantic = observation?.semantic;
      const unavailableDependency = semantic?.dependencies.some(d => !Object.hasOwn(known, d.field) && !(d.requires === 'presence' && ['present_unknown', 'absent'].includes(current.get(d.field)?.presence ?? '')));
      const requiresSemantic = scope.spec?.needsSemantics(field) ?? false;
      if (!selected && changed.has(field)) {
        status = observation?.presence === 'absent' ? 'removed' : 'invalidated'; code = status === 'invalidated' ? 'FIELD_INVALIDATED' : undefined;
        explanation = messages.changed;
      } else if (observation?.presence === 'not_applicable') { status = 'not_applicable'; explanation = messages.notApplicable; }
      else if (!Object.hasOwn(known, field)) {
        status = observation?.presence === 'absent' ? 'removed' : ['unknown', 'present_unknown'].includes(observation?.presence ?? '') ? 'unknown' : 'not_provided';
        code = status === 'unknown' ? 'FIELD_APPLICABILITY_UNKNOWN' : status === 'not_provided' && scope.spec?.plan(field).required ? 'FIELD_REQUIRED_MISSING' : undefined;
        explanation = messages.noValue;
      } else if (!scope.spec) { status = 'unknown'; code = 'FIELD_VALIDATION_UNDETERMINED'; explanation = messages.noDeclaration; }
      else {
        const plan = scope.spec.plan(field, directory), domains = new Map<string, unknown[]>(); let open = false;
        for (const dependency of plan.reads) if (!Object.hasOwn(known, dependency)) {
          const o = current.get(dependency);
          if (o?.presence === 'absent') domains.set(dependency, [ABSENT]);
          else {
            // A presence-only obligation is invariant under all substitutions
            // of this value. Its complete quotient has only absent/present
            // classes. The representative never enters authoritative inputs.
            const domain = plan.valueReads.has(dependency) ? scope.spec.domain(dependency) : [true];
            if (!domain) { open = true; break; }
            domains.set(dependency, o?.presence === 'present_unknown' ? domain : [ABSENT, ...domain]);
          }
        }
        if (open) {
          // A failed fully determined conjunct proves failure in EVERY world,
          // even when another atomic obligation has an infinite unknown domain.
          // Do not use a successful projection to claim global validity.
          const presence = new Set([...Object.keys(known), ...observations.filter(o => ['absent', 'present_unknown'].includes(o.presence)).map(o => o.field)]);
          const certainRule = plan.certainRule(new Set(Object.keys(known)), presence), certainData = cloneJson(known);
          for (const o of observations) if (o.presence === 'present_unknown') Object.defineProperty(certainData, o.field, {value: true, enumerable: true, writable: true, configurable: true});
          const certain = validator.validate(certainRule, certainData, budget);
          verdict = certain.valid ? {status: 'unknown', reason: 'open', errors: []} : {status: 'invalid', reason: 'exhaustive', errors: certain.errors};
        } else verdict = classify(plan.rule, known, domains, validator, budget);
        if (verdict.status === 'valid') { value = known[field] as JsonValue; status = value === null ? 'explicit_null' : 'present'; if (status === 'explicit_null') explanation = messages.explicitNull; }
        else if (verdict.status === 'invalid') { status = selected ? 'invalid' : 'invalidated'; code = selected ? 'FIELD_VALUE_INVALID' : 'FIELD_INVALIDATED'; explanation = messages.invalid; }
        else { status = 'unknown'; code = verdict.reason === 'open' ? 'FIELD_VALIDATION_UNDETERMINED' : 'FIELD_DEPENDENCY_MISSING'; explanation = verdict.reason === 'open' ? messages.open : messages.mixed; }
      }
      if (semanticIssue && ['FIELD_CARDINALITY_MISMATCH', 'FIELD_APPLICABILITY_UNKNOWN'].includes(semanticIssue.code)) {
        status = semanticIssue.code === 'FIELD_CARDINALITY_MISMATCH' ? selected ? 'invalid' : 'invalidated' : 'unknown';
        code = semanticIssue.code; value = undefined; explanation = semanticIssue.message;
      } else if (requiresSemantic && (['present', 'explicit_null'].includes(status) || semantic?.status === 'invalid' || semanticIssue?.code === 'FIELD_VALUE_INVALID')) {
        if (semantic?.status === 'invalid' || semanticIssue?.code === 'FIELD_VALUE_INVALID') {
          status = selected ? 'invalid' : 'invalidated'; code = selected ? 'FIELD_VALUE_INVALID' : 'FIELD_INVALIDATED'; value = undefined;
          explanation = semanticIssue?.message ?? semantic!.explanation;
        } else if (semanticIssue || !semantic || semantic.status === 'unknown' || unavailableDependency) {
          status = 'unknown'; value = undefined; code = semanticIssue?.code ?? (unavailableDependency ? 'FIELD_DEPENDENCY_MISSING' : 'FIELD_APPLICABILITY_UNKNOWN');
          explanation = semanticIssue?.message ?? semantic?.explanation ?? messages.semanticUnknown;
        }
      } else if (semanticIssue && ['present', 'explicit_null'].includes(status)) {
        // The model may interpret prose but cannot overrule a deterministic
        // declaration using a contradictory ungrounded field issue.
        violation('/issues', 'SEMANTIC_INVARIANT');
      }
      const report: CheckedField = {ownerKey: key, container, field, path, status, trigger, sources, ...(value !== undefined ? {value} : {}), ...(explanation ? {explanation} : {}), ...(observation?.rawText !== null && observation?.rawText !== undefined ? {rawText: observation.rawText} : {})};
      values.push(report);
      const nested = [...new Set((verdict?.errors ?? []).map(e => e.path).filter(p => p.startsWith(path + '/')))];
      if (code && !(semanticIssue?.code === code && semanticIssue.fieldTarget?.path === path)) {
        const paths = nested.length ? nested : [path];
        for (const nestedPath of paths) {
          if (nestedPath !== path) values.push({...report, path: nestedPath});
          issues.push({ownerKey: key, issue: {id: `field-${issues.length}`, code, category: 'data', message: explanation!, container, field, path: nestedPath, ...(sources.length ? {sourceRefs: cloneJson(sources)} : {})}});
        }
      }
    }
  }
  return {values, issues};
}
