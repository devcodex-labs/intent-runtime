import { IntentError } from '../contracts/errors.js';
import { Validator, type JSONSchema } from 'schema-dsl/pure';
import type { JsonObject } from '../contracts/public.js';
import { cloneJson, measure } from '../internal/json.js';
import { escapeToken, resolve, tokens } from '../internal/pointer.js';

// Schema syntax nodes are distinct from literal JSON in const/default/examples.
export type SchemaNode = boolean | Record<string, any>;
const maps = new Set(['properties', 'patternProperties', 'definitions']);
const single = new Set(['additionalProperties', 'propertyNames', 'items', 'additionalItems', 'contains', 'not', 'if', 'then', 'else']);
const arrays = new Set(['allOf', 'anyOf', 'oneOf']);
const annotations = new Set(['$schema', '$id', 'definitions', 'title', 'description', 'examples', 'default', '$comment', '_label', '_customMessages', '_description', '_required']);
const allowed = new Set([...annotations, ...maps, ...single, ...arrays, '$ref', 'type', 'required', 'dependencies', 'enum', 'const', 'minLength', 'maxLength', 'pattern', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minItems', 'maxItems', 'uniqueItems', 'minProperties', 'maxProperties', 'format', 'strictSchema', 'requiredAll', 'exactLength']);
const formats = new Set(['date', 'time', 'date-time', 'duration', 'email', 'hostname', 'ipv4', 'ipv6', 'uri', 'uri-reference', 'uuid', 'regex', 'json-pointer', 'relative-json-pointer']);
interface Location { node: SchemaNode; path: string; resource: string; base: string }
interface ReadFootprint {values: Set<string> | null; presence: Set<string> | null}
interface Atom { schema: SchemaNode; reads: Set<string> | null; presence: Set<string> | null; affected: Set<string> | null; required?: string; local?: boolean; presenceEffect?: boolean }
export interface FieldPlan { rule: SchemaNode; reads: Set<string>; valueReads: Set<string>; presenceReads: Set<string>; required: boolean; certainRule(knownValues: Set<string>, knownPresence: Set<string>): SchemaNode }

export class Definition {
  readonly declaration: JsonObject;
  private readonly normalized!: Record<string, any>;
  private readonly atoms!: Atom[];
  constructor(declaration: JsonObject, maxBytes: number, maxDepth: number) {
    this.declaration = declaration;
    const locations = new Map<string, Location>(), resources = new Map<string, string>();
    const invalid = (): never => { throw new IntentError('SCHEMA_INVALID', { stage: 'config' }); };
    const unsupported = (): never => { throw new IntentError('SCHEMA_UNSUPPORTED_FOR_EXTRACTION', { stage: 'config' }); };
    const childEntries = (node: Record<string, any>): [string, SchemaNode][] => {
      const result: [string, SchemaNode][] = [];
      for (const [key, value] of Object.entries(node)) {
        if (maps.has(key)) {
          if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
          for (const [name, child] of Object.entries(value)) result.push([`/${key}/${escapeToken(name)}`, child as SchemaNode]);
        } else if (arrays.has(key) || key === 'items' && Array.isArray(value)) {
          if (!Array.isArray(value) || arrays.has(key) && !value.length) invalid();
          value.forEach((child: SchemaNode, index: number) => result.push([`/${key}/${index}`, child]));
        } else if (single.has(key)) result.push(['/' + key, value]);
        else if (key === 'dependencies') {
          if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
          for (const [name, child] of Object.entries(value)) {
            if (Array.isArray(child)) { if (child.some(v => typeof v !== 'string') || new Set(child).size !== child.length) invalid(); }
            else result.push([`/dependencies/${escapeToken(name)}`, child as SchemaNode]);
          }
        }
      }
      return result;
    };
    const inspect = (node: SchemaNode, path: string, base: string, resource: string): void => {
      if (typeof node !== 'boolean' && (!node || typeof node !== 'object' || Array.isArray(node))) invalid();
      if (typeof node !== 'boolean') {
        for (const key of Object.keys(node)) if (!allowed.has(key)) unsupported();
        if (node.$schema !== undefined && node.$schema !== 'http://json-schema.org/draft-07/schema#' && node.$schema !== 'http://json-schema.org/draft-07/schema') unsupported();
        if (node.$id !== undefined) {
          if (typeof node.$id !== 'string') invalid();
          let url: URL; try { url = new URL(node.$id, base); } catch { return invalid(); }
          if (url.hash) unsupported(); base = url.href; resource = path;
          if (resources.has(base) && resources.get(base) !== path) invalid(); resources.set(base, path);
        }
        if (node.type !== undefined) {
          const types = Array.isArray(node.type) ? node.type : [node.type];
          if (!types.length || types.some((t: unknown) => !['null', 'boolean', 'object', 'array', 'number', 'integer', 'string'].includes(String(t))) || new Set(types).size !== types.length) invalid();
        }
        if (node.required !== undefined && (!Array.isArray(node.required) || node.required.some((v: unknown) => typeof v !== 'string') || new Set(node.required).size !== node.required.length)) invalid();
        if (node.enum !== undefined && (!Array.isArray(node.enum) || !node.enum.length)) invalid();
        if (node.format !== undefined && !formats.has(node.format)) unsupported();
        if (node.pattern !== undefined) { if (typeof node.pattern !== 'string') invalid(); try { new RegExp(node.pattern, 'u'); } catch { invalid(); } }
        for (const pattern of Object.keys(node.patternProperties ?? {})) { try { new RegExp(pattern, 'u'); } catch { invalid(); } }
        for (const key of ['minLength', 'maxLength', 'minItems', 'maxItems', 'minProperties', 'maxProperties', 'exactLength']) if (node[key] !== undefined && (!Number.isSafeInteger(node[key]) || node[key] < 0)) invalid();
        for (const key of ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf']) if (node[key] !== undefined && (typeof node[key] !== 'number' || key === 'multipleOf' && node[key] <= 0)) invalid();
        for (const key of ['uniqueItems', 'strictSchema', 'requiredAll', '_required']) if (node[key] !== undefined && typeof node[key] !== 'boolean') invalid();
      }
      locations.set(path, { node, path, resource, base });
      if (typeof node !== 'boolean') for (const [suffix, child] of childEntries(node)) inspect(child, path + suffix, base, resource);
    };
    const initial = 'https://intent.invalid/local'; resources.set(initial, ''); inspect(declaration, '', initial, '');
    const targets = new Map<string, string>();
    for (const location of locations.values()) {
      if (typeof location.node === 'boolean' || location.node.$ref === undefined) continue;
      const ref = location.node.$ref;
      if (typeof ref !== 'string') invalid();
      if (!ref.startsWith('#')) unsupported();
      if (Object.keys(location.node).some(k => k !== '$ref' && !annotations.has(k))) unsupported();
      let pointer: string; try { pointer = decodeURIComponent(ref.slice(1)); tokens(pointer); } catch { return invalid(); }
      const target = location.resource + pointer;
      if (!locations.has(target)) invalid(); targets.set(location.path, target);
    }
    const active = new Set<string>(), done = new Set<string>();
    const cycles = (path: string): void => {
      if (active.has(path)) unsupported(); if (done.has(path)) return; active.add(path);
      const location = locations.get(path)!; const target = targets.get(path);
      if (target !== undefined) cycles(target);
      if (typeof location.node !== 'boolean') for (const [suffix] of childEntries(location.node)) cycles(path + suffix);
      active.delete(path); done.add(path);
    };
    cycles('');
    const rewrite = (node: SchemaNode, path: string): SchemaNode => {
      if (typeof node === 'boolean') return node;
      const out = cloneJson(node); delete out.$id; delete out.$schema;
      const target = targets.get(path); if (target !== undefined) out.$ref = '#/definitions/__intent_source' + target;
      for (const [suffix, child] of childEntries(node)) {
        const parts = tokens(suffix); let bag = out;
        for (const key of parts.slice(0, -1)) bag = bag[key];
        Object.defineProperty(bag, parts.at(-1)!, { value: rewrite(child, path + suffix), enumerable: true, writable: true, configurable: true });
      }
      return out;
    };
    this.normalized = rewrite(declaration, '') as Record<string, any>;
    // Charge the supplied declaration. Rewritten, bounded internal ref strings
    // are not additional caller material and must not lower the public limit.
    measure(declaration, { maxBytes, maxDepth, limit: 'maxSchemaBytes', stage: 'config', invalid: 'SCHEMA_INVALID' });
    // Official compilation checks the complete declaration's syntax, not business data.
    const syntax = new Validator({...{inlineRefs: false}, strict: false, useDefaults: false, coerceTypes: false, removeAdditional: false, cache: false});
    try { syntax.compile({definitions: {__intent_source: this.normalized}, $ref: '#/definitions/__intent_source'} as JSONSchema); }
    catch (cause) { throw new IntentError('SCHEMA_INVALID', {stage: 'config', cause}); }
    finally { syntax.clearCache(); }
    const nodeAt = (path: string): SchemaNode => resolve(this.normalized, path).value as SchemaNode;
    const deref = (raw: SchemaNode): SchemaNode => {
      let node = raw;
      while (typeof node !== 'boolean' && node.$ref) node = nodeAt(node.$ref.slice('#/definitions/__intent_source'.length));
      return node;
    };
    const footprints = new WeakMap<object, ReadFootprint>();
    const merge = (into: ReadFootprint, other: ReadFootprint): void => {
      for (const part of ['values', 'presence'] as const) {
        if (into[part] === null || other[part] === null) into[part] = null;
        else other[part].forEach(n => into[part]!.add(n));
      }
    };
    const footprint = (raw: SchemaNode): ReadFootprint => {
      const node = deref(raw); if (typeof node === 'boolean') return {values: new Set(), presence: new Set()};
      if (footprints.has(node)) return footprints.get(node)!;
      const result: ReadFootprint = {values: new Set(), presence: new Set()};
      for (const [key, value] of Object.entries(node)) {
        if (key === 'properties') Object.keys(value).forEach(n => {result.values?.add(n); result.presence?.add(n);});
        else if (key === 'required') value.forEach((n: string) => result.presence?.add(n));
        else if (key === 'requiredAll') Object.keys(node.properties ?? {}).forEach(n => result.presence?.add(n));
        else if (key === 'dependencies') for (const [name, child] of Object.entries(value)) {
          result.presence?.add(name);
          if (Array.isArray(child)) child.forEach(n => result.presence?.add(n)); else merge(result, footprint(child as SchemaNode));
        }
        else if (arrays.has(key) || ['if', 'then', 'else', 'not'].includes(key)) for (const child of arrays.has(key) ? value : [value]) merge(result, footprint(child));
        else if (['const', 'enum', 'patternProperties'].includes(key) || key === 'additionalProperties' && typeof value === 'object') {result.values = null; result.presence = null;}
        else if (['propertyNames', 'minProperties', 'maxProperties'].includes(key)) result.presence = null;
      }
      footprints.set(node, result); return result;
    };
    const affected = (f: ReadFootprint): Set<string> | null => f.values === null || f.presence === null ? null : new Set([...f.values, ...f.presence]);
    const atoms: Atom[] = [];
    const splitNodes = new WeakSet<object>();
    const split = (raw: SchemaNode): void => {
      const node = deref(raw);
      if (typeof node === 'boolean') { if (!node) atoms.push({ schema: false, reads: new Set(), presence: new Set(), affected: null }); return; }
      // Repeating an identical assertion at the same positive root is idempotent.
      // Keep reference DAGs shared rather than expanding them exponentially.
      if (splitNodes.has(node)) return; splitNodes.add(node);
      for (const [name, rule] of Object.entries(node.properties ?? {})) atoms.push({ schema: { properties: { [name]: rule } }, reads: new Set([name]), presence: new Set([name]), affected: new Set([name]), local: true });
      for (const name of new Set<string>([...(node.required ?? []), ...(node.requiredAll ? Object.keys(node.properties ?? {}) : [])])) atoms.push({ schema: { required: [name] }, reads: new Set(), presence: new Set([name]), affected: new Set([name]), required: name });
      for (const child of node.allOf ?? []) split(child);
      for (const key of ['anyOf', 'oneOf', 'not']) if (key in node) { const rule = { [key]: node[key] }, f = footprint(rule); const a = affected(f); atoms.push({schema: rule, reads: f.values, presence: f.presence, affected: a?.size ? a : null}); }
      if ('if' in node) {
        const schema = Object.fromEntries(['if', 'then', 'else'].filter(k => k in node).map(k => [k, node[k]]));
        const branch = affected(footprint({allOf: [node.then ?? true, node.else ?? true]})), f = footprint(schema);
        atoms.push({schema, reads: f.values, presence: f.presence, affected: branch?.size ? branch : null});
      }
      for (const [name, dependency] of Object.entries(node.dependencies ?? {})) { const schema = {dependencies: {[name]: dependency}}, f = footprint(schema); atoms.push({schema, reads: f.values, presence: f.presence, affected: affected(f), presenceEffect: true}); }
      const excluded = new Set([...annotations, 'properties', 'required', 'requiredAll', 'allOf', 'anyOf', 'oneOf', 'not', 'if', 'then', 'else', 'dependencies']);
      const shape = Object.fromEntries(Object.entries(node).filter(([key]) => !excluded.has(key)));
      if (Object.keys(shape).length) {
        const dynamic = ['additionalProperties', 'patternProperties', 'propertyNames', 'strictSchema', 'minProperties', 'maxProperties', 'enum', 'const'].some(k => k in shape);
        if (dynamic) shape.properties = Object.fromEntries(Object.keys(node.properties ?? {}).map(k => [k, true]));
        const f = footprint(Object.fromEntries(Object.entries(shape).filter(([k]) => k !== 'properties')));
        atoms.push({schema: shape, reads: f.values, presence: f.presence, affected: dynamic ? null : new Set()});
      }
    };
    split(this.normalized); this.atoms = atoms;
  }
  get fields(): string[] { return Object.keys(this.declaration.properties as JsonObject); }
  hasPath(parts: string[]): boolean {
    const visit = (raw: SchemaNode, remaining: string[]): boolean => {
      let node = raw;
      while (typeof node !== 'boolean' && node.$ref) node = resolve(this.normalized, node.$ref.slice('#/definitions/__intent_source'.length)).value as SchemaNode;
      if (!remaining.length) return true;
      if (typeof node === 'boolean') return node;
      const [key, ...tail] = remaining;
      if (Object.hasOwn(node.properties ?? {}, key!) && visit(node.properties[key!], tail)) return true;
      if (!tail.length && (node.required?.includes(key) || Object.hasOwn(node.dependencies ?? {}, key!) || Object.values(node.dependencies ?? {}).some(d => Array.isArray(d) && d.includes(key)))) return true;
      for (const [pattern, rule] of Object.entries(node.patternProperties ?? {})) if (new RegExp(pattern, 'u').test(key!) && visit(rule as SchemaNode, tail)) return true;
      if (/^(0|[1-9][0-9]*)$/.test(key!) && node.items !== undefined) {
        const item = Array.isArray(node.items) ? node.items[Number(key)] ?? node.additionalItems : node.items;
        if (item !== undefined && visit(item, tail)) return true;
      }
      for (const name of ['allOf', 'anyOf', 'oneOf', 'if', 'then', 'else', 'not']) {
        for (const rule of (Array.isArray(node[name]) ? node[name] : node[name] === undefined ? [] : [node[name]])) if (visit(rule, remaining)) return true;
      }
      for (const dependency of Object.values(node.dependencies ?? {})) if (!Array.isArray(dependency) && visit(dependency as SchemaNode, remaining)) return true;
      return typeof node.additionalProperties === 'object' && visit(node.additionalProperties, tail);
    };
    return visit(this.normalized, parts);
  }
  plan(field: string, directory: readonly string[] = this.fields): FieldPlan {
    const names = [...new Set([...this.fields, ...directory])];
    const selected = new Set(this.atoms.filter(a => a.affected === null || a.affected.has(field)));
    const valueReads = new Set<string>([field]), presenceReads = new Set<string>([field]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const atom of selected) {
        for (const name of atom.reads ?? names) if (!valueReads.has(name)) {valueReads.add(name); grew = true;}
        for (const name of atom.presence ?? names) if (!presenceReads.has(name)) {presenceReads.add(name); grew = true;}
      }
      const reads = new Set([...valueReads, ...presenceReads]);
      for (const atom of this.atoms) {
        if (atom.required || selected.has(atom)) continue;
        // Existence-only obligations never pull in unrelated value rules.
        const necessary = atom.presenceEffect ? reads : valueReads;
        if (atom.affected === null || [...atom.affected].some(name => necessary.has(name))) {selected.add(atom); grew = true;}
      }
    }
    const obligations = [...selected].filter(a => !a.required || a.required === field);
    const bundle = (atoms: Atom[]): SchemaNode => ({$schema: 'http://json-schema.org/draft-07/schema#', definitions: {__intent_source: this.normalized}, allOf: atoms.map(a => a.schema)});
    return {rule: bundle(obligations), reads: new Set([...valueReads, ...presenceReads]), valueReads, presenceReads, required: [...selected].some(a => a.required === field), certainRule: (knownValues, knownPresence) => bundle(obligations.filter(a => [...a.reads ?? names].every(n => knownValues.has(n)) && [...a.presence ?? names].every(n => knownPresence.has(n))))};
  }
  needsSemantics(field: string): boolean {
    const visited = new WeakSet<object>();
    const visit = (raw: SchemaNode): boolean => {
      let node = raw;
      while (typeof node !== 'boolean' && node.$ref) node = resolve(this.normalized, node.$ref.slice('#/definitions/__intent_source'.length)).value as SchemaNode;
      if (typeof node === 'boolean' || visited.has(node)) return false; visited.add(node);
      if (['description', '_description'].some(k => typeof node[k] === 'string' && node[k].trim())) return true;
      for (const key of ['properties', 'patternProperties']) for (const child of Object.values(node[key] ?? {})) if (visit(child as SchemaNode)) return true;
      for (const key of ['items', 'additionalItems', 'additionalProperties', 'contains', 'not', 'if', 'then', 'else', 'allOf', 'anyOf', 'oneOf']) {
        const children = Array.isArray(node[key]) ? node[key] : node[key] === undefined ? [] : [node[key]];
        if (children.some((child: SchemaNode) => visit(child))) return true;
      }
      return false;
    };
    const roots = new WeakSet<object>();
    const rootDescription = (raw: SchemaNode): boolean => {
      let node = raw;
      while (typeof node !== 'boolean' && node.$ref) node = resolve(this.normalized, node.$ref.slice('#/definitions/__intent_source'.length)).value as SchemaNode;
      if (typeof node === 'boolean' || roots.has(node)) return false; roots.add(node);
      return ['description', '_description'].some(k => typeof node[k] === 'string' && node[k].trim()) || (node.allOf ?? []).some(rootDescription);
    };
    // Positive-root prose survives splitting, while the complete relevant
    // atomic rules include descriptions inside conditions and local refs.
    return rootDescription(this.normalized) || visit(this.plan(field).rule);
  }
  domain(field: string): unknown[] | null {
    const rules: SchemaNode[] = [], roots = new WeakSet<object>();
    const deref = (raw: SchemaNode): SchemaNode => {let node = raw; while (typeof node !== 'boolean' && node.$ref) node = resolve(this.normalized, node.$ref.slice('#/definitions/__intent_source'.length)).value as SchemaNode; return node;};
    const collect = (raw: SchemaNode): void => {
      const node = deref(raw); if (typeof node === 'boolean' || roots.has(node)) return; roots.add(node);
      if (Object.hasOwn(node.properties ?? {}, field)) rules.push(deref(node.properties[field]));
      let patterned = false;
      for (const [pattern, rule] of Object.entries(node.patternProperties ?? {})) if (new RegExp(pattern, 'u').test(field)) {patterned = true; rules.push(deref(rule as SchemaNode));}
      if (!Object.hasOwn(node.properties ?? {}, field) && !patterned && typeof node.additionalProperties === 'object') rules.push(deref(node.additionalProperties));
      for (const child of node.allOf ?? []) collect(child);
    };
    collect(this.normalized);
    // Only positive declarations establish a domain. A guard is a predicate,
    // not a licence to discard nonmatching values from its possible worlds.
    for (const rule of rules) if (typeof rule !== 'boolean' && Object.hasOwn(rule, 'const')) return [rule.const];
    for (const rule of rules) if (typeof rule !== 'boolean' && rule.enum) return rule.enum;
    for (const rule of rules) if (typeof rule !== 'boolean') {
      const types = Array.isArray(rule.type) ? rule.type : [rule.type];
      if (types.every((t: unknown) => t === 'boolean' || t === 'null')) return types.flatMap((t: unknown) => t === 'boolean' ? [false, true] : [null]);
    }
    return null;
  }
}
