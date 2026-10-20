import { IntentError, fail, violation } from '../contracts/errors.js';
import { ContractValidator } from '../internal/contracts.js';
import { decodeJson, plain, snapshot } from '../internal/json.js';
import { escapeToken, resolve } from '../internal/pointer.js';

type Schema = Record<string, unknown>;
export interface OpenAiOutput {
  schema: object;
  decode(text: string): string;
  close(): void;
}

const protocolExample = {
  version: 'candidate-2', kind: 'request', normalizedInput: 'Show record A12 without deleting it.', relatedKeys: ['n1'], historyCoverage: 'complete', usedHistory: false,
  messages: {changed: 'The supplied value changed.', notApplicable: 'The declared field does not apply.', noValue: 'No definite value is supplied.', noDeclaration: 'No declaration is available.', explicitNull: 'An explicit null is supplied.', invalid: 'The value fails its declared rule.', open: 'The rule cannot be fully established.', mixed: 'The supplied conditions permit different outcomes.', semanticUnknown: 'The semantic relation is not established.', unresolved: 'The target is unresolved.', relationConflict: 'The requested order conflicts.'},
  nodes: [{key: 'n1', parentKey: null, priorRef: null, domain: 'records', action: 'show', target: 'A12', goal: 'Show record A12', understanding: 'clear', optional: null, expectedOutput: [], sources: [{root: 'input', pointer: '', quote: null}]}],
  constraints: [{key: 'c1', priorRef: null, ownerKey: 'n1', scope: 'intent', referenceKey: null, kind: 'prohibition', text: 'Do not delete the record', expressionJson: null, sources: [{root: 'input', pointer: '', quote: null}]}],
  references: [], relations: [], priorTargets: [],
  changes: [{operation: 'add', effect: 'applied', targetKind: 'intent', targetKey: 'n1', conditionKey: null, description: 'Add the requested goal', sources: [{root: 'input', pointer: '', quote: null}], deltaHints: []}, {operation: 'add', effect: 'applied', targetKind: 'constraint', targetKey: 'c1', conditionKey: null, description: 'Retain the prohibition', sources: [{root: 'input', pointer: '', quote: null}], deltaHints: []}],
  observations: [{ownerKey: 'n1', container: 'inputs', field: 'recordId', presence: 'known', withdrawn: false, valueJson: '"A12"', rawText: null, sources: [{root: 'input', pointer: '', quote: null}], semantic: null}],
  issues: [], inferences: [], evidence: [], suggestions: [],
};
const exampleTargets = [['n1', 'A12'], ['n2', 'B34']] as const;
const protocolMultiExample = {
  ...protocolExample, normalizedInput: 'Show records A12 and B34 separately.', relatedKeys: ['n1', 'n2'], constraints: [],
  nodes: exampleTargets.map(([key, target]) => ({...protocolExample.nodes[0]!, key, target, goal: 'Show record ' + target})),
  changes: exampleTargets.map(([key]) => ({...protocolExample.changes[0]!, targetKey: key})),
  observations: exampleTargets.map(([ownerKey, target]) => ({...protocolExample.observations[0]!, ownerKey, valueJson: JSON.stringify(target)})),
};
const protocolAmendExample = {
  ...protocolExample, kind: 'amendment', normalizedInput: 'Disable expedited delivery for record A12; retain the delivery goal.', usedHistory: true, relatedKeys: ['p1'], constraints: [],
  nodes: [{...protocolExample.nodes[0]!, key: 'p1', priorRef: {root: 'baseline', pointer: '/intents/0', quote: null}, action: 'deliver', goal: 'Deliver record A12 with expedited delivery disabled'}],
  changes: [{...protocolExample.changes[0]!, operation: 'modify', targetKey: 'p1', description: 'Change the existing delivery setting', deltaHints: [{path: '/inputs/expedited', operation: 'set'}]}],
  observations: [{...protocolExample.observations[0]!, ownerKey: 'p1', field: 'expedited', valueJson: 'false'}],
};

export const OPENAI_WIRE_INSTRUCTIONS = `
OpenAI strict wire requirements (the supplied core instructions still apply):
Every SourceRef includes quote. For root=input the wire schema requires pointer="" and quote:null: cite the original input by pointer, without generating a local quotation. For other roots use quote:null when no quote is needed or the resolved source is not a string; a nonnull quote MUST be an exact verbatim substring at that root/pointer, never normalized or invented. Only this registered SourceRef field uses null to represent omission. Preserve all other required nullable fields and JSON-encoded business values.
SourceRef roots refer to the named original material, not the enclosing model request JSON: root=input is the user's input STRING, so its whole-text pointer is "", never "/request/fields". The whole schema also uses pointer="", not "/". Semantic dependencies use declared top-level FIELD NAMES, such as "isVip", never JSON Pointers such as "/isVip". Do not invent observations for undeclared fields or supply semantic verdicts where formal Schema validation suffices; semantic may be null.
Every messages slot MUST contain a nonempty generic explanation in the configured language, including inactive cases; empty strings are invalid. These slots explain validation states, not just the current input.
Retain the core ownership and change invariants: observations belong to the actual node key; every new node needs an applied add change targeting that same key with an input source. Preserve explicit prohibitions as constraints. When a selected scalar field belongs separately to distinct user targets, keep their nodes and observations separate; never substitute an array for a declared scalar value.
Use n1/n2 for NEW nodes with priorRef=null, p1/p2 for EXISTING nodes with nonnull priorRef. Constraints use c1/pc1 and relations r1/pr1 for new/existing objects. An existing node's current modification uses modify, never add; unchanged confirmation, rejection and actual withdrawal retain their own operations. In a baseline amendment preserve identity with priorRef={"root":"baseline","pointer":"/intents/0","quote":null}; never copy long baseline IDs into keys. observations.ownerKey is the exact current n/p node key for inputs/extensions, never null. Inherit unchanged baseline values through the core, rather than resubmitting them as new observations.
relatedKeys contains ONLY active CURRENT node keys that occur in nodes, for example ["n1"]. It NEVER contains constraint/reference/relation keys such as c1. A constraint may have its own add change without appearing in relatedKeys.
Do NOT also list a node's priorRef in priorTargets: priorTargets is only for prior objects NOT represented in the current node/constraint/relation arrays. A retained current node with priorRef needs no priorTargets entry. Each observation tuple (ownerKey, container, field) occurs at most once. The core owns formal type/range/condition/required/dependency checks and inherited invalidation; do not duplicate these as issues or copy obsolete issues into a corrected turn. Keep genuine scalar cardinality, uncertain applicability and prose-rule field diagnostics. Field issues use category=data, a nonnull fieldTarget and one of the six allowed FIELD_* codes; semantic ambiguities/conflicts use fieldTarget=null. A fieldTarget.path is a business pointer such as /discount, never /inputs/discount.
deltaHints use a DIFFERENT coordinate system: a complete target snapshot. An intent's input field is /inputs/fieldName, not /fieldName; a goal is /goal, and reference removal may be /references/0. Hints are optional actual snapshot changes, not placeholders. A resolved change must name a real object; do not add a constraint change saying "none" with a null or invented target.
Formal invalidation of an inherited value is not an unconfirmed inference or an intent conflict. Report the explicit current value and let the core invalidate the old dependent value. Never target an inputs/extensions container or any descendant with an inference, including through a parent children path and including values the core removes. A real semantic assumption may target /target or /goal on the actual node, a valid nested semantic slot, or the fact root. Field evidence and real deltaHints use their own existing location rules. Preserve actual user-stated contradictions, unconfirmed objects and their genuine issues instead of suppressing all issues/inferences.
NON-FACTUAL PROTOCOL EXAMPLE: if the input were "Show record A12, do not delete it", and the supplied business schema declared the selected string field recordId, one valid wire candidate would be:
${JSON.stringify(protocolExample)}
NON-FACTUAL MULTI-TARGET EXAMPLE: if the input were "Show records A12 and B34 separately", with the same declared scalar recordId field, separate owned values require separate targets, not an array value or duplicate fields on one target:
${JSON.stringify(protocolMultiExample)}
NON-FACTUAL AMENDMENT EXAMPLE: suppose a supplied delivery baseline has recordId="A12", expedited=true and allowance=7, and the formal schema permits allowance<=9 when expedited=true but <=3 otherwise. For "Disable expedited delivery; keep the delivery goal", the existing node uses p1/modify. The core inherits recordId and invalidates allowance; do not invent a goal conflict or an inference keeping 7. One candidate would be:
${JSON.stringify(protocolAmendExample)}
The example's record, identifier, field and language are NOT facts about the actual request. Use only the actual input/materials, declared fields and configured language. Empty arrays are appropriate when no references, evidence or suggestions are needed; do not invent them just to fill the structure.`;

/** Compile the bounded candidate dialect without changing the shared core contract. */
export function compileOpenAiOutput(input: object): OpenAiOutput {
  const invalid = (path: string): never => fail('CONFIG_INVALID', 'config', '/outputSchema' + path);
  let original: Schema;
  try {original = snapshot(input, {maxBytes: 1048576, maxDepth: 64, limit: 'outputSchema', stage: 'config', invalid: 'CONFIG_INVALID'}) as Schema;}
  catch {return invalid('');}
  const paths = new WeakMap<object, string>(), nullableQuotes = new WeakSet<object>();
  const refs: Array<{node: Schema; ref: string; path: string}> = [];
  let propertyCount = 0, enumCount = 0, stringCount = 0;
  const annotations = new Set(['title', 'description']);
  const countString = (s: string, path: string): void => {stringCount += s.length; if (stringCount > 120000) invalid(path);};
  function compile(value: unknown, path: string): Schema {
    if (!plain(value)) return invalid(path);
    paths.set(value, path);
    if (Object.hasOwn(value, 'allOf')) {
      if (Object.keys(value).length !== 1 || !Array.isArray(value.allOf) || value.allOf.length !== 1 || !plain(value.allOf[0]) || Object.keys(value.allOf[0]).length !== 1 || !Array.isArray(value.allOf[0].anyOf)) return invalid(path + '/allOf');
      return compile(value.allOf[0], path);
    }
    const out: Schema = {};
    const allowed = new Set(['type', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const', 'anyOf', '$ref', '$defs', 'definitions', '$schema', ...annotations]);
    for (const key of Object.keys(value)) if (!allowed.has(key)) invalid(path + '/' + escapeToken(key));
    for (const key of annotations) if (Object.hasOwn(value, key)) {
      if (typeof value[key] !== 'string') invalid(path + '/' + key);
      out[key] = value[key];
    }
    if (value.definitions !== undefined && value.$defs !== undefined) invalid(path + '/$defs');
    const definitions = value.definitions ?? value.$defs;
    if (definitions !== undefined) {
      if (!plain(definitions)) return invalid(path + '/$defs');
      const defs: Schema = {};
      for (const [name, child] of Object.entries(definitions)) {
        countString(name, path); Object.defineProperty(defs, name, {value: compile(child, path + '/$defs/' + escapeToken(name)), enumerable: true});
      }
      out.$defs = defs;
    }
    if (value.$ref !== undefined) {
      if (typeof value.$ref !== 'string' || Object.keys(value).some(k => !['$ref', ...annotations].includes(k))) return invalid(path + '/$ref');
      refs.push({node: out, ref: value.$ref, path}); return out;
    }
    if (value.anyOf !== undefined) {
      if (!Array.isArray(value.anyOf) || !value.anyOf.length || Object.keys(value).some(k => !['anyOf', ...annotations].includes(k))) return invalid(path + '/anyOf');
      out.anyOf = value.anyOf.map((child, i) => compile(child, path + '/anyOf/' + i)); return out;
    }
    const types = Array.isArray(value.type) ? value.type : [value.type];
    if (!types.length || types.some(t => !['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'].includes(t as string)) || new Set(types).size !== types.length) return invalid(path + '/type');
    if (types.length > 1 && types.some(t => t === 'object' || t === 'array')) return invalid(path + '/type');
    out.type = value.type;
    for (const key of ['enum', 'const'] as const) if (Object.hasOwn(value, key)) {
      const values = key === 'enum' ? value.enum : [value.const];
      if (!Array.isArray(values) || !values.length || values.some(v => v !== null && !['string', 'number', 'boolean'].includes(typeof v))) return invalid(path + '/' + key);
      if (key === 'enum') {enumCount += values.length; if (enumCount > 1000) invalid(path + '/enum');}
      for (const v of values) if (typeof v === 'string') countString(v, path);
      if (key === 'enum' && values.length > 250 && values.reduce((n, v) => n + (typeof v === 'string' ? v.length : 0), 0) > 15000) invalid(path + '/enum');
      out[key] = value[key];
    }
    if (value.type === 'object') {
      if (!plain(value.properties) || value.additionalProperties !== false || !Array.isArray(value.required) || value.required.some(k => typeof k !== 'string' || !Object.hasOwn(value.properties as object, k)) || new Set(value.required).size !== value.required.length) return invalid(path);
      const properties: Schema = {}, keys = Object.keys(value.properties);
      propertyCount += keys.length; if (propertyCount > 5000) invalid(path + '/properties');
      const optional = keys.filter(k => !(value.required as unknown[]).includes(k));
      const quote = value.properties.quote;
      const sourceRef = keys.length === 3 && keys.includes('root') && keys.includes('pointer') && optional.length === 1 && optional[0] === 'quote' && plain(quote) && quote.type === 'string' && Object.keys(quote).length === 1 && plain(value.properties.root) && value.properties.root.type === 'string' && Array.isArray(value.properties.root.enum) && plain(value.properties.pointer) && value.properties.pointer.type === 'string';
      if (optional.length && !sourceRef) return invalid(path + '/required');
      for (const [key, child] of Object.entries(value.properties)) {
        countString(key, path);
        const compiled = compile(child, path + '/properties/' + escapeToken(key));
        if (sourceRef && key === 'quote') compiled.type = ['string', 'null'];
        Object.defineProperty(properties, key, {value: compiled, enumerable: true});
      }
      out.properties = properties; out.required = [...value.required, ...optional]; out.additionalProperties = false;
      if (sourceRef) nullableQuotes.add(out);
    } else if (value.type === 'array') out.items = compile(value.items, path + '/items');
    if (value.type !== 'object' && ['properties', 'required', 'additionalProperties'].some(k => Object.hasOwn(value, k)) || value.type !== 'array' && Object.hasOwn(value, 'items')) invalid(path);
    return out;
  }
  const schema = compile(original, '');
  if (schema.type !== 'object' || schema.anyOf || schema.$ref) return invalid('');
  for (const ref of refs) {
    if (!ref.ref.startsWith('#/')) return invalid(ref.path + '/$ref');
    let target: ReturnType<typeof resolve>;
    try {target = resolve(original, decodeURIComponent(ref.ref.slice(1)));} catch {return invalid(ref.path + '/$ref');}
    const targetPath = target.found && target.value && typeof target.value === 'object' ? paths.get(target.value) : undefined;
    if (targetPath === undefined) return invalid(ref.path + '/$ref');
    ref.node.$ref = '#' + targetPath;
  }
  const dereference = (node: Schema): Schema => {
    const target = resolve(schema, (node.$ref as string).slice(1));
    if (!target.found || !plain(target.value)) return invalid('');
    return target.value;
  };
  // Schema-local guidance keeps the model protocol next to the generated fields.
  // Provider-only refinements never change the shared candidate contract.
  const isCandidate = plain(original.properties) && plain(original.properties.version) && original.properties.version.const === 'candidate-2' && ['nodes', 'constraints', 'relations', 'changes', 'observations', 'relatedKeys', 'priorTargets', 'inferences', 'evidence', 'issues', 'references'].every(k => Object.hasOwn(original.properties as object, k));
  if (isCandidate) {
    const explain = (properties: Record<string, Schema>, key: string, description: string): void => {if (properties[key]) properties[key]!.description = description;};
    function describe(node: Schema): void {
      if (plain(node.properties)) {
        const p = node.properties as Record<string, Schema>;
        if (p.root && p.pointer && p.quote) {
          explain(p, 'pointer', 'JSON Pointer relative to the named original material. Use an empty string for the whole material; input is the user text, not the enclosing request object.');
          explain(p, 'quote', 'Input sources require null. For other roots prefer null; any string must be an exact verbatim substring at that root/pointer.');
        }
        if (p.ownerKey && p.container && p.field && p.presence) {
          explain(p, 'ownerKey', 'Exact current node key: n1 for new or p1 for existing. Never null for inputs/extensions. Distinct targets need distinct owners.');
          explain(p, 'field', 'Exact declared top-level field name, not a JSON Pointer or a container-prefixed path.');
          explain(p, 'semantic', 'Use null when formal Schema validation suffices. Do not manufacture a semantic verdict for ordinary typed values.');
        }
        if (p.relatedKeys && p.nodes && p.messages) {
          explain(p, 'relatedKeys', 'ONLY active node keys occurring in nodes. Never include constraint/reference/relation keys.');
          explain(p, 'priorTargets', 'Only prior objects NOT represented by current nodes/constraints/relations. Do not repeat any current object priorRef here. Usually empty.');
          explain(p, 'issues', 'Usually empty for straightforward formal Schema checks: the core generates those reports and inherited invalidation. Retain genuine cardinality/applicability/prose field issues and real user-stated ambiguities/conflicts.');
          explain(p, 'observations', 'At most one value per ownerKey/container/field tuple. A scalar field on two distinct targets uses two nodes, one owned observation each, never an array value or duplicate tuple.');
          const messages = p.messages.$ref ? dereference(p.messages) : p.messages;
          if (plain(messages.properties)) for (const message of Object.values(messages.properties) as Schema[]) if (message.type === 'string') {
            message.pattern = '\\S'; message.description = 'Required nonblank generic explanation of this validation state in the configured language, even when inactive.';
          }
        }
        if (p.code && p.fieldTarget && p.candidates && p.questions) {
          explain(p, 'code', 'Do not generate FIELD_INVALIDATED. Formal validation/invalidation is performed by the core. FIELD_* candidate claims, if truly necessary, must obey the supplied core instructions.');
          explain(p, 'fieldTarget', 'For a genuine field issue: container plus exact declared field name and a business pointer beginning with that field, without an inputs/facts/extensions prefix. Otherwise null.');
        }
      }
      for (const value of Object.values(node)) if (Array.isArray(value)) {for (const child of value) if (plain(child)) describe(child);} else if (plain(value)) describe(value);
    }
    describe(schema);
    refineCandidate(schema, nullableQuotes, dereference);
  }
  // Count the serialized derived schema as well, including duplicated variants.
  propertyCount = enumCount = stringCount = 0;
  function count(node: Schema, path: string): void {
    if (plain(node.properties)) for (const [key, child] of Object.entries(node.properties)) {propertyCount++; countString(key, path); count(child as Schema, path + '/properties/' + escapeToken(key));}
    if (plain(node.$defs)) for (const [key, child] of Object.entries(node.$defs)) {countString(key, path); count(child as Schema, path + '/$defs/' + escapeToken(key));}
    if (plain(node.items)) count(node.items, path + '/items');
    if (Array.isArray(node.anyOf)) node.anyOf.forEach((child, i) => count(child as Schema, path + '/anyOf/' + i));
    if (Array.isArray(node.enum)) {enumCount += node.enum.length; for (const value of node.enum) if (typeof value === 'string') countString(value, path); if (node.enum.length > 250 && node.enum.reduce((n, v) => n + (typeof v === 'string' ? v.length : 0), 0) > 15000) invalid(path + '/enum');}
    if (typeof node.const === 'string') countString(node.const, path);
    if (propertyCount > 5000 || enumCount > 1000) invalid(path);
  }
  count(schema, '');
  const active = new Set<Schema>(), heights = new WeakMap<Schema, number>();
  function height(node: Schema): number {
    const prior = heights.get(node); if (prior !== undefined) return prior;
    if (active.has(node)) return invalid('');
    active.add(node);
    const result = node.$ref ? height(dereference(node)) : Array.isArray(node.anyOf) ? Math.max(...(node.anyOf as Schema[]).map(height)) : node.type === 'object' ? Math.max(0, ...Object.values(node.properties as Schema).map(child => 1 + height(child as Schema))) : node.type === 'array' ? Math.max(0, 1 + height(node.items as Schema)) : -1;
    active.delete(node); heights.set(node, result); return result;
  }
  const maxDepth = height(schema);
  // Check unused definitions too: they must not conceal unsupported recursion.
  for (const ref of refs) height(ref.node);
  if (maxDepth > 9) return invalid('');
  const validator = new ContractValidator();
  function normalize(node: Schema, value: unknown): void {
    if (node.$ref) return normalize(dereference(node), value);
    if (Array.isArray(node.anyOf)) {
      const branch = (node.anyOf as Schema[]).find(child => validator.valid({...child, ...(schema.$defs ? {$defs: schema.$defs} : {})}, value));
      if (!branch) violation();
      return normalize(branch, value);
    }
    if (node.type === 'object') {
      const object = value as Schema;
      if (nullableQuotes.has(node) && object.quote === null) delete object.quote;
      for (const [key, child] of Object.entries(node.properties as Schema)) if (Object.hasOwn(object, key)) normalize(child as Schema, object[key]);
    } else if (node.type === 'array') for (const item of value as unknown[]) normalize(node.items as Schema, item);
  }
  return {schema, decode(text) {
    let value: unknown;
    try {value = decodeJson(text, maxDepth);} catch (cause) {if (cause instanceof IntentError) throw cause; if (cause instanceof SyntaxError) return violation(); throw cause;}
    validator.candidate(schema, value); normalize(schema, value);
    return JSON.stringify(value);
  }, close() {validator.close();}};
}

/** Restrict generation combinations; invalid replies are rejected, never repaired. */
function refineCandidate(schema: Schema, nullableQuotes: WeakSet<object>, dereference: (node: Schema) => Schema): void {
  const actual = (node: Schema): Schema => node.$ref ? actual(dereference(node)) : node;
  const properties = (node: Schema): Record<string, Schema> => actual(node).properties as Record<string, Schema>;
  const root = properties(schema);
  const item = (key: string): Schema => actual(actual(root[key]!).items as Schema);
  const variant = (base: Schema, overrides: Record<string, Schema>): Schema => ({...base, properties: {...properties(base), ...overrides}});
  const choose = (node: Schema, variants: Schema[]): void => {for (const key of Object.keys(node)) delete node[key]; node.anyOf = variants;};
  const keyed = (prefix: string, nullable = false): Schema => ({type: nullable ? ['string', 'null'] : 'string', pattern: '^(?:' + prefix + ')[1-9][0-9]*$'});
  const nodeKey = (nullable = false): Schema => keyed('n|p', nullable);
  const nil = (): Schema => ({type: 'null'});
  const constant = (value: string): Schema => ({type: 'string', const: value});
  const nonnull = (node: Schema): Schema => {const branches = actual(node).anyOf as Schema[]; return {anyOf: branches.filter(branch => branch.type !== 'null')};};
  // Source variants retain their own exact nullable-quote decode registration.
  function sources(node: Schema): void {
    for (const value of Object.values(node)) if (Array.isArray(value)) {for (const child of value) if (plain(child)) sources(child);} else if (plain(value)) sources(value);
    if (!nullableQuotes.has(node) || !plain(node.properties)) return;
    const p = properties(node), roots = p.root!.enum as string[], branches: Schema[] = [];
    if (roots.includes('input')) branches.push(variant(node, {root: constant('input'), pointer: {type: 'string', const: ''}, quote: nil()}));
    const others = roots.filter(root => root !== 'input');
    if (others.length) branches.push(variant(node, {root: {type: 'string', enum: others}}));
    branches.forEach(branch => nullableQuotes.add(branch)); choose(node, branches);
  }
  sources(schema);
  function identities(base: Schema, fresh: string, prior: string): Schema[] {
    const p = properties(base);
    return [variant(base, {key: keyed(fresh), priorRef: nil()}), variant(base, {key: keyed(prior), priorRef: nonnull(p.priorRef!)})];
  }
  const node = item('nodes'); node.properties = {...properties(node), parentKey: nodeKey(true)}; choose(node, identities(node, 'n', 'p'));
  const constraint = item('constraints'), constraintBranches: Schema[] = [];
  for (const branch of identities(constraint, 'c', 'pc')) {
    const scopes = properties(branch).scope!.enum as string[];
    constraintBranches.push(variant(branch, {scope: constant('global'), ownerKey: nil()}), variant(branch, {scope: {type: 'string', enum: scopes.filter(s => s !== 'global')}, ownerKey: nodeKey()}));
  }
  choose(constraint, constraintBranches);
  const relation = item('relations'); relation.properties = {...properties(relation), fromKey: nodeKey(), toKey: nodeKey()}; choose(relation, identities(relation, 'r', 'pr'));
  actual(root.relatedKeys!).items = nodeKey();
  const reference = item('references'); reference.properties = {...properties(reference), ownerKey: nodeKey(), intentKey: nodeKey(true)};
  const observation = item('observations'); choose(observation, [variant(observation, {container: {type: 'string', enum: ['inputs', 'extensions']}, ownerKey: nodeKey()}), variant(observation, {container: constant('facts'), ownerKey: nil()})]);
  const prior = item('priorTargets'); choose(prior, [['intent', 'p'], ['constraint', 'pc'], ['relation', 'pr']].map(([kind, prefix]) => variant(prior, {kind: constant(kind!), key: keyed(prefix!)})));
  const issue = item('issues'); issue.properties = {...properties(issue), ownerKey: nodeKey(true)};
  const candidate = actual(actual(properties(issue).candidates!).items as Schema); candidate.properties = {...properties(candidate), intentKey: nodeKey(true)};
  const issueProperties = properties(issue);
  // Correlate field ownership and category during generation. Shallow variants
  // retain the existing SourceRef nodes and their nullable-quote registrations.
  choose(issue, [
    variant(issue, {category: {type: 'string', enum: (issueProperties.category!.enum as string[]).filter(category => category !== 'data')}, fieldTarget: nil()}),
    variant(issue, {category: constant('data'), fieldTarget: nonnull(issueProperties.fieldTarget!), code: {type: 'string', enum: ['FIELD_VALUE_INVALID', 'FIELD_CARDINALITY_MISMATCH', 'FIELD_DEPENDENCY_MISSING', 'FIELD_APPLICABILITY_UNKNOWN', 'FIELD_REQUIRED_MISSING', 'FIELD_VALIDATION_UNDETERMINED']}}),
  ]);
  const snapshotRoots: Record<string, string[]> = {
    intent: ['id', 'domain', 'action', 'target', 'goal', 'understanding', 'constraints', 'inputs', 'references', 'children', 'extensions', 'optional', 'expectedOutput'],
    constraint: ['id', 'scope', 'kind', 'text', 'expression', 'sourceRefs'],
    relation: ['id', 'kind', 'fromId', 'toId', 'condition', 'sourceRefs'],
  };
  const snapshotPath = (kind: string): Schema => ({type: 'string', pattern: '^(?:$|/(?:' + snapshotRoots[kind]!.join('|') + ')(?:/.*)?)$', description: 'Relative to the complete target snapshot. Intent business fields use /inputs/fieldName, never /fieldName.'});
  const change = item('changes'), changeProperties = properties(change), hints = actual(changeProperties.deltaHints!), hint = actual(hints.items as Schema), branches: Schema[] = [];
  const prefixes: Record<string, string> = {intent: 'n|p', constraint: 'c|pc', relation: 'r|pr'};
  for (const kind of ['intent', 'constraint', 'relation']) for (const effect of ['applied', 'conditional', 'unresolved']) {
    const common = {targetKind: constant(kind), targetKey: keyed(prefixes[kind]!), effect: constant(effect), conditionKey: effect === 'conditional' ? keyed('c|pc') : keyed('c|pc', true), deltaHints: effect === 'applied' ? {...hints, items: variant(hint, {path: snapshotPath(kind)})} : {...hints, maxItems: 0}};
    if (kind === 'intent' && effect === 'applied') {
      branches.push(variant(change, {...common, operation: constant('add'), targetKey: keyed('n')}), variant(change, {...common, operation: {type: 'string', enum: (changeProperties.operation!.enum as string[]).filter(op => op !== 'add')}}));
    } else branches.push(variant(change, common));
  }
  branches.push(variant(change, {targetKind: constant('unresolved'), targetKey: nil(), effect: constant('unresolved'), conditionKey: keyed('c|pc', true), deltaHints: {...hints, maxItems: 0}}));
  choose(change, branches);
  function locator(base: Schema, inference: boolean): Schema {
    const variants = ['intent', 'constraint', 'relation'].map(kind => {
      let path = snapshotPath(kind);
      if (inference && kind === 'intent') path = {type: 'string', pattern: '^(?:$|/(?:' + snapshotRoots.intent!.filter(k => !['inputs', 'extensions'].includes(k)).join('|') + ')(?:/.*)?)$', description: 'Unconfirmed semantic assumption about an existing slot. Never target an inputs/extensions container or descendant; the core also checks resolved nested-child locations.'};
      return variant(base, {kind: constant(kind), key: keyed(prefixes[kind]!), path});
    });
    variants.push(variant(base, {kind: constant('fact'), key: nil(), path: inference ? {type: 'string', const: ''} : properties(base).path!}));
    return {anyOf: variants};
  }
  for (const [name, inference] of [['inferences', true], ['evidence', false]] as const) {
    const entry = item(name), p = properties(entry); entry.properties = {...p, target: locator(actual(p.target!), inference)};
  }
}
