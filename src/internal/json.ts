import { types } from 'node:util';
import { IntentError } from '../contracts/errors.js';
import type { IntentErrorCode, IntentErrorStage, JsonValue } from '../contracts/public.js';

export interface JsonBoundary {
  maxBytes: number; maxDepth: number; limit: string; stage: IntentErrorStage;
  invalid?: IntentErrorCode; schemaProxy?: (v: object) => boolean; schemaCache?: boolean;
}
export function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !types.isProxy(value) && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function stringSize(text: string, cap: number): number {
  let bytes = 2;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 34 || c === 92 || [8, 9, 10, 12, 13].includes(c)) bytes += 2;
    else if (c < 32) bytes += 6;
    else if (c >= 0xd800 && c <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) { bytes += 4; i++; } else bytes += 6;
    } else if (c >= 0xdc00 && c <= 0xdfff) bytes += 6;
    else bytes += c < 128 ? 1 : c < 2048 ? 2 : 3;
    if (bytes > cap) return cap + 1;
  }
  return bytes;
}
export function measure(value: unknown, boundary: JsonBoundary): number {
  const { maxBytes, maxDepth, limit, stage } = boundary;
  const invalid = (): never => { throw new IntentError(boundary.invalid ?? 'INPUT_INVALID', { stage }); };
  const exceeded = (dimension: string, allowed: number, observed: number | undefined, unit: 'depth' | 'bytes'): never => {
    throw new IntentError('RESOURCE_LIMIT', { stage, details: { limit: dimension, allowed, ...(observed !== undefined ? {observed} : {}), unit } });
  };
  const active = new WeakSet<object>(), memo = new WeakMap<object, { bytes: number; height: number }>();
  function visit(v: unknown, depth: number): { bytes: number; height: number } {
    if (v === null) return { bytes: 4, height: -1 };
    if (typeof v === 'string') return { bytes: stringSize(v, maxBytes), height: -1 };
    if (typeof v === 'boolean') return { bytes: v ? 4 : 5, height: -1 };
    if (typeof v === 'number' && Number.isFinite(v)) return { bytes: JSON.stringify(v).length, height: -1 };
    if (!v || typeof v !== 'object') return invalid();
    if (types.isProxy(v) && !boundary.schemaProxy?.(v)) return invalid();
    if (depth > maxDepth) return exceeded('maxDepth', maxDepth, depth, 'depth');
    if (active.has(v)) return invalid();
    const previous = memo.get(v);
    if (previous) {
      if (depth + previous.height > maxDepth) return exceeded('maxDepth', maxDepth, depth + previous.height, 'depth');
      return previous;
    }
    if (!Array.isArray(v) && ![Object.prototype, null].includes(Object.getPrototypeOf(v))) return invalid();
    const keys = Reflect.ownKeys(v);
    if (Array.isArray(v) && keys.length !== v.length + 1) return invalid();
    active.add(v); let bytes = 2, height = 0, count = 0;
    for (const key of keys) {
      if (Array.isArray(v) && key === 'length') continue;
      const d = Object.getOwnPropertyDescriptor(v, key);
      if (!d || !('value' in d)) return invalid();
      if (typeof key === 'symbol') {
        if (boundary.schemaCache && key === Symbol.for('schema-dsl.schemaCacheKey') && !d.enumerable && typeof d.value === 'string' && d.value.startsWith('schema:')) continue;
        return invalid();
      }
      if (!d.enumerable || Array.isArray(v) && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= v.length)) return invalid();
      bytes += (count++ ? 1 : 0) + (Array.isArray(v) ? 0 : stringSize(key, maxBytes) + 1);
      if (bytes > maxBytes) return exceeded(limit, maxBytes, undefined, 'bytes');
      const child = visit(d.value, depth + 1); bytes += child.bytes; height = Math.max(height, child.height < 0 ? 0 : child.height + 1);
      if (bytes > maxBytes) return exceeded(limit, maxBytes, undefined, 'bytes');
    }
    active.delete(v); const result = { bytes, height }; memo.set(v, result); return result;
  }
  const bytes = visit(value, 0).bytes;
  if (bytes > maxBytes) exceeded(limit, maxBytes, undefined, 'bytes');
  return bytes;
}
export function cloneJson<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  const out = Array.isArray(value) ? [] : {};
  for (const key of Object.keys(value)) Object.defineProperty(out, key, { value: cloneJson(Object.getOwnPropertyDescriptor(value, key)!.value), enumerable: true, configurable: true, writable: true });
  return out as T;
}
export function snapshot<T>(value: T, boundary: JsonBoundary): T { measure(value, boundary); return cloneJson(value); }
export function equalJson(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right)) return false;
  const a = Object.keys(left), b = Object.keys(right);
  return a.length === b.length && a.every(key => Object.hasOwn(right, key) && equalJson(Object.getOwnPropertyDescriptor(left, key)!.value, Object.getOwnPropertyDescriptor(right, key)!.value));
}
// Duplicate keys are rejected before JSON.parse can overwrite semantic data.
export function decodeJson(text: string, maxDepth = 64): JsonValue {
  let i = 0;
  const ws = () => { while (/\s/.test(text[i] ?? '') && i < text.length) i++; };
  function string(): string {
    const start = i++; while (i < text.length) { const c = text[i++]; if (c === '"') return JSON.parse(text.slice(start, i)) as string; if (c === '\\') i++; }
    throw new SyntaxError('Unterminated JSON string');
  }
  function value(depth = 0): void {
    ws(); const c = text[i];
    if ((c === '{' || c === '[') && depth > maxDepth) throw new IntentError('RESOURCE_LIMIT', {stage: 'validation', details: {limit: 'maxDepth', allowed: maxDepth, observed: depth, unit: 'depth'}});
    if (c === '{') { i++; ws(); const keys = new Set<string>(); if (text[i] === '}') { i++; return; }
      for (;;) { ws(); if (text[i] !== '"') throw new SyntaxError('Expected key'); const key = string(); if (keys.has(key)) throw new SyntaxError('Duplicate key'); keys.add(key); ws(); if (text[i++] !== ':') throw new SyntaxError('Expected colon'); value(depth + 1); ws(); const end = text[i++]; if (end === '}') return; if (end !== ',') throw new SyntaxError('Expected comma'); }
    }
    if (c === '[') { i++; ws(); if (text[i] === ']') { i++; return; } for (;;) { value(depth + 1); ws(); const end = text[i++]; if (end === ']') return; if (end !== ',') throw new SyntaxError('Expected comma'); } }
    if (c === '"') { string(); return; }
    const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(i));
    if (!match) throw new SyntaxError('Invalid JSON value'); i += match[0].length;
  }
  value(); ws(); if (i !== text.length) throw new SyntaxError('Trailing JSON');
  return JSON.parse(text) as JsonValue;
}
