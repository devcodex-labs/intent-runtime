import { Validator, type JSONSchema } from 'schema-dsl/pure';
import { IntentError } from '../contracts/errors.js';
import { cloneJson } from '../internal/json.js';
import { normalizeSchemaErrors, type SchemaError } from './errors.js';
import type { SchemaNode } from './compile.js';

export const ABSENT = Symbol('absent');
export class ValidationBudget {
  used = 0;
  constructor(readonly max: number) {}
  take(): void {
    if (this.used >= this.max) throw new IntentError('RESOURCE_LIMIT', { stage: 'validation', details: { limit: 'maxValidationChecks', allowed: this.max, observed: this.used + 1, unit: 'calls' } });
    this.used++;
  }
}
export class BusinessValidator {
  private readonly validator = new Validator({ ...{inlineRefs: false}, strict: false, useDefaults: false, coerceTypes: false, removeAdditional: false, cache: false, allErrors: true });
  validate(rule: SchemaNode, data: unknown, budget: ValidationBudget): { valid: boolean; errors: SchemaError[] } {
    budget.take(); const copy = cloneJson(data), before = JSON.stringify(copy);
    try {
      const result = this.validator.validate(rule as JSONSchema, copy, { smartCoerce: false, coerce: false, format: false });
      if (typeof result.valid !== 'boolean' || JSON.stringify(copy) !== before || result.data !== undefined && JSON.stringify(result.data) !== before) throw new TypeError('Unexpected Validator result');
      return { valid: result.valid, errors: normalizeSchemaErrors(result.errors ?? []) };
    } catch (cause) {
      if (cause instanceof IntentError) throw cause;
      throw new IntentError('INTERNAL_PROCESSING_FAILED', { stage: 'validation', cause });
    }
  }
  close(): void { this.validator.clearCache(); }
}
export interface Verdict { status: 'valid' | 'invalid' | 'unknown'; reason: 'exhaustive' | 'mixed' | 'open' | 'conflict'; errors: SchemaError[] }
export function classify(rule: SchemaNode, known: Record<string, unknown>, domains: Map<string, unknown[]>, validator: BusinessValidator, budget: ValidationBudget): Verdict {
  if ([...domains.values()].some(values => !values.length)) return { status: 'unknown', reason: 'conflict', errors: [] };
  const entries = [...domains.entries()]; let yes = false, no = false; const errors: SchemaError[] = [];
  function* worlds(index: number, data: Record<string, unknown>): Generator<Record<string, unknown>> {
    if (index === entries.length) { yield data; return; }
    const [name, values] = entries[index]!;
    for (const value of values) {
      const next = cloneJson(data); if (value === ABSENT) delete next[name]; else Object.defineProperty(next, name, { value: cloneJson(value), enumerable: true, writable: true, configurable: true });
      yield* worlds(index + 1, next);
    }
  }
  for (const world of worlds(0, known)) {
    const result = validator.validate(rule, world, budget); yes ||= result.valid; no ||= !result.valid; errors.push(...result.errors);
    if (yes && no) return { status: 'unknown', reason: 'mixed', errors };
  }
  return { status: yes ? 'valid' : 'invalid', reason: 'exhaustive', errors };
}
