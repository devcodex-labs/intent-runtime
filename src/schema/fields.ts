import type { IntentIssue, JsonObject, JsonValue, SourceRef } from '../contracts/public.js';
import { IntentError, violation } from '../contracts/errors.js';
import type { CandidateDraft, CheckedField, Observation, NodeDraft } from '../model/candidate.js';
import { cloneJson, decodeJson, equalJson, measure, plain } from '../internal/json.js';
import { escapeToken } from '../internal/pointer.js';
import { sourceValue } from '../internal/source.js';
import { Definition } from './compile.js';
import { ABSENT, BusinessValidator, classify, ValidationBudget, type Verdict } from './validate.js';

export function checkFields(draft: CandidateDraft, materials: Record<string, unknown>, schema: Definition | undefined, extension: Definition | undefined, selection: string[], outputExtensions: boolean, validator: BusinessValidator, budget: ValidationBudget, maxBytes: number, maxDepth: number): {values: CheckedField[]; issues: Array<{ownerKey: string | null; issue: IntentIssue}>} {
  const values: CheckedField[] = [], issues: Array<{ownerKey: string | null; issue: IntentIssue}> = [];
  for (const [i, o] of draft.observations.entries()) {
    const spec = o.container === 'extensions' ? extension : schema;
    const owner = draft.nodes.find(n => n.key === o.ownerKey);
    const prior = owner?.priorRef ? sourceValue(owner.priorRef, materials) : undefined;
    const priorBag = prior && typeof prior === 'object' ? (prior as Record<string, unknown>)[o.container] : undefined;
    const oldField = plain(priorBag) && Object.hasOwn(priorBag, o.field);
    if ((!spec?.fields.includes(o.field) && !oldField) || o.container === 'facts' && (o.ownerKey !== null || draft.nodes.length) || o.container !== 'facts' && !owner) violation('/observations/' + i, 'FIELD_OWNERSHIP');
    if (o.presence === 'known' && (!o.sources.length || o.valueJson === null)) violation('/observations/' + i, 'SOURCE_INVALID');
    if (o.presence === 'known' && !o.sources.some(s => ['input', 'context', 'baseline'].includes(s.root))) violation('/observations/' + i, 'SOURCE_INVALID');
    o.sources.forEach(s => sourceValue(s, materials));
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
    const known: Record<string, unknown> = cloneJson(inherited), changed = new Set<string>();
    for (const o of observations) {
      if (current.has(o.field)) violation('/observations', 'DUPLICATE_ID'); current.set(o.field, o);
      if (o.presence === 'known') {
        let value: JsonValue; try { value = decodeJson(o.valueJson!, maxDepth); } catch (cause) { if (cause instanceof IntentError) throw cause; return violation('/observations', 'STRUCTURE'); }
        measure(value, {maxBytes, maxDepth, limit: 'maxOutputBytes', stage: 'validation', invalid: 'MODEL_OUTPUT_INVALID'});
        Object.defineProperty(known, o.field, {value, enumerable: true, configurable: true, writable: true});
        if (Object.hasOwn(inherited, o.field) && !equalJson(value, inherited[o.field])) changed.add(o.field);
      } else if (['absent', 'unknown', 'present_unknown', 'not_applicable'].includes(o.presence)) {
        if (Object.hasOwn(inherited, o.field)) changed.add(o.field); delete known[o.field];
      }
    }
    const checks = new Set(scope.selected);
    for (const field of Object.keys(inherited)) if (changed.has(field) || scope.spec?.fields.includes(field) && changed.size && [...scope.spec.plan(field).reads].some(f => changed.has(f))) checks.add(field);
    for (const field of Object.keys(inherited)) if (!checks.has(field)) values.push({ownerKey: key, container, field, path: '/' + escapeToken(field), status: inherited[field] === null ? 'explicit_null' : 'present', trigger: 'selection', value: inherited[field]!, sources: [], inherited: true});
    for (const field of checks) {
      const selected = scope.selected.includes(field), observation = current.get(field), path = '/' + escapeToken(field);
      const oldSource: SourceRef[] = scope.owner?.priorRef && Object.hasOwn(inherited, field) ? [{root: scope.owner.priorRef.root, pointer: scope.owner.priorRef.pointer + '/' + container + path}] : [];
      const sources = observation?.sources.length ? observation.sources : oldSource;
      let status: CheckedField['status'], code: string | undefined, explanation: string | undefined, value: JsonValue | undefined, verdict: Verdict | undefined;
      const trigger = selected ? 'selection' : 'invalidation';
      if (!selected && changed.has(field)) {
        status = observation?.presence === 'absent' ? 'removed' : 'invalidated'; code = status === 'invalidated' ? 'FIELD_INVALIDATED' : undefined;
        explanation = 'The prior value was explicitly changed; no unselected replacement is extracted.';
      } else if (observation?.presence === 'not_applicable') { status = 'not_applicable'; explanation = 'The supplied field definition does not apply to this intent.'; }
      else if (!Object.hasOwn(known, field)) {
        status = observation?.presence === 'absent' ? 'removed' : ['unknown', 'present_unknown'].includes(observation?.presence ?? '') ? 'unknown' : 'not_provided';
        code = status === 'unknown' ? 'FIELD_APPLICABILITY_UNKNOWN' : status === 'not_provided' && scope.spec?.plan(field).required ? 'FIELD_REQUIRED_MISSING' : undefined;
        explanation = 'No definite applicable value is supplied.';
      } else if (!scope.spec) { status = 'unknown'; code = 'FIELD_VALIDATION_UNDETERMINED'; explanation = 'No current declaration is available to check the changed value.'; }
      else {
        const plan = scope.spec.plan(field), domains = new Map<string, unknown[]>(); let open = false;
        for (const dependency of plan.reads) if (!Object.hasOwn(known, dependency)) {
          const o = current.get(dependency);
          if (o?.presence === 'absent') domains.set(dependency, [ABSENT]);
          else {
            const domain = scope.spec.domain(dependency);
            if (!domain) { open = true; break; }
            domains.set(dependency, o?.presence === 'present_unknown' ? domain : [ABSENT, ...domain]);
          }
        }
        verdict = open ? {status: 'unknown', reason: 'open', errors: []} : classify(plan.rule, known, domains, validator, budget);
        if (verdict.status === 'valid') { value = known[field] as JsonValue; status = value === null ? 'explicit_null' : 'present'; if (status === 'explicit_null') explanation = 'Explicit null is permitted by the declaration.'; }
        else if (verdict.status === 'invalid') { status = selected ? 'invalid' : 'invalidated'; code = selected ? 'FIELD_VALUE_INVALID' : 'FIELD_INVALIDATED'; explanation = 'The supplied value fails a related declared rule.'; }
        else { status = 'unknown'; code = verdict.reason === 'open' ? 'FIELD_VALIDATION_UNDETERMINED' : 'FIELD_DEPENDENCY_MISSING'; explanation = verdict.reason === 'open' ? 'The local strategy cannot establish a complete finite proof.' : 'Possible supplied-definition worlds have different validation outcomes.'; }
      }
      const report: CheckedField = {ownerKey: key, container, field, path, status, trigger, sources, ...(value !== undefined ? {value} : {}), ...(explanation ? {explanation} : {}), ...(observation?.rawText !== null && observation?.rawText !== undefined ? {rawText: observation.rawText} : {})};
      values.push(report);
      const nested = [...new Set((verdict?.errors ?? []).map(e => e.path).filter(p => p.startsWith(path + '/')))];
      if (code) {
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
