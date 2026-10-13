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
interface Atom { schema: SchemaNode; reads: Set<string> | null; affected: Set<string> | null; required?: string }
export interface FieldPlan { rule: SchemaNode; reads: Set<string>; required: boolean }

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
    measure(this.normalized, { maxBytes, maxDepth, limit: 'maxSchemaBytes', stage: 'config', invalid: 'SCHEMA_INVALID' });
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
    const footprints = new WeakMap<object, Set<string> | null>();
    const footprint = (raw: SchemaNode): Set<string> | null => {
      const node = deref(raw); if (typeof node === 'boolean') return new Set();
      if (footprints.has(node)) return footprints.get(node)!;
      const result = new Set<string>();
      for (const [key, value] of Object.entries(node)) {
        if (key === 'properties') Object.keys(value).forEach(n => result.add(n));
        else if (key === 'required') value.forEach((n: string) => result.add(n));
        else if (key === 'dependencies') for (const [name, child] of Object.entries(value)) { result.add(name); const f = Array.isArray(child) ? new Set<string>(child) : footprint(child as SchemaNode); if (!f) return null; f.forEach(n => result.add(n)); }
        else if (arrays.has(key) || ['if', 'then', 'else', 'not'].includes(key)) for (const child of arrays.has(key) ? value : [value]) { const f = footprint(child); if (!f) return null; f.forEach(n => result.add(n)); }
        else if (['const', 'enum', 'patternProperties', 'propertyNames', 'additionalProperties', 'strictSchema', 'minProperties', 'maxProperties'].includes(key)) return null;
      }
      footprints.set(node, result); return result;
    };
    const atoms: Atom[] = [];
    const splitNodes = new WeakSet<object>();
    const split = (raw: SchemaNode): void => {
      const node = deref(raw);
      if (typeof node === 'boolean') { if (!node) atoms.push({ schema: false, reads: new Set(), affected: null }); return; }
      // Repeating an identical assertion at the same positive root is idempotent.
      // Keep reference DAGs shared rather than expanding them exponentially.
      if (splitNodes.has(node)) return; splitNodes.add(node);
      for (const [name, rule] of Object.entries(node.properties ?? {})) atoms.push({ schema: { properties: { [name]: rule } }, reads: new Set([name]), affected: new Set([name]) });
      for (const name of new Set<string>([...(node.required ?? []), ...(node.requiredAll ? Object.keys(node.properties ?? {}) : [])])) atoms.push({ schema: { required: [name] }, reads: new Set([name]), affected: new Set([name]), required: name });
      for (const child of node.allOf ?? []) split(child);
      for (const key of ['anyOf', 'oneOf', 'not']) if (key in node) { const rule = { [key]: node[key] }, reads = footprint(rule); atoms.push({ schema: rule, reads, affected: reads?.size ? reads : null }); }
      if ('if' in node) {
        const schema = Object.fromEntries(['if', 'then', 'else'].filter(k => k in node).map(k => [k, node[k]]));
        const branch = footprint({ allOf: [node.then ?? true, node.else ?? true] });
        atoms.push({ schema, reads: footprint(schema), affected: branch?.size ? branch : null });
      }
      for (const [name, dependency] of Object.entries(node.dependencies ?? {})) { const schema = { dependencies: { [name]: dependency } }, reads = footprint(schema); atoms.push({ schema, reads, affected: reads }); }
      const excluded = new Set([...annotations, 'properties', 'required', 'requiredAll', 'allOf', 'anyOf', 'oneOf', 'not', 'if', 'then', 'else', 'dependencies']);
      const shape = Object.fromEntries(Object.entries(node).filter(([key]) => !excluded.has(key)));
      if (Object.keys(shape).length) {
        const dynamic = ['additionalProperties', 'patternProperties', 'propertyNames', 'strictSchema', 'minProperties', 'maxProperties', 'enum', 'const'].some(k => k in shape);
        if (dynamic) shape.properties = Object.fromEntries(Object.keys(node.properties ?? {}).map(k => [k, true]));
        const presenceSensitive = ['minProperties', 'maxProperties', 'enum', 'const'].some(k => k in shape);
        atoms.push({ schema: shape, reads: presenceSensitive ? null : new Set(), affected: dynamic ? null : new Set() });
      }
    };
    split(this.normalized); this.atoms = atoms;
  }
  get fields(): string[] { return Object.keys(this.declaration.properties as JsonObject); }
  plan(field: string): FieldPlan {
    const selected = this.atoms.filter(a => a.affected === null || a.affected.has(field));
    const reads = new Set<string>([field]); selected.forEach(a => (a.reads ?? new Set(this.fields)).forEach(n => reads.add(n)));
    // Dependencies require local type checks, but not independent required presence assertions.
    const local = this.atoms.filter(a => a.affected?.size === 1 && !a.required && a.reads?.size === 1 && [...a.reads].some(n => reads.has(n)));
    const rules = [...new Set([...selected, ...local])].filter(a => !a.required || a.required === field).map(a => a.schema);
    return { rule: { $schema: 'http://json-schema.org/draft-07/schema#', definitions: { __intent_source: this.normalized }, allOf: rules }, reads, required: selected.some(a => a.required === field) };
  }
  domain(field: string): unknown[] | null {
    const raw = (this.normalized.properties ?? {})[field] as SchemaNode | undefined;
    let node = raw;
    while (node && typeof node !== 'boolean' && node.$ref) node = resolve(this.normalized, node.$ref.slice('#/definitions/__intent_source'.length)).value as SchemaNode;
    if (!node || typeof node === 'boolean') return null;
    if (Object.hasOwn(node, 'const')) return [node.const]; if (node.enum) return node.enum;
    const types = Array.isArray(node.type) ? node.type : [node.type];
    return types.every((t: unknown) => t === 'boolean' || t === 'null') ? types.flatMap((t: unknown) => t === 'boolean' ? [false, true] : [null]) : null;
  }
}
