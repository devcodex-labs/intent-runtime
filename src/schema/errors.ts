import { IntentError } from '../contracts/errors.js';
import { escapeToken, tokens } from '../internal/pointer.js';

export interface SchemaError { keyword: string; path: string }
const broken = (): never => { throw new IntentError('INTERNAL_PROCESSING_FAILED', { stage: 'validation' }); };
export function normalizeSchemaError(value: unknown): SchemaError[] {
  if (!value || typeof value !== 'object') return broken();
  const error = value as Record<string, unknown>;
  if (typeof error.keyword !== 'string' || ['schema', 'internal'].includes(String(error.kind)) || error.code === 'VALIDATION_INTERNAL_ERROR') return broken();
  const raw = error.instancePath ?? error.path;
  if (typeof raw !== 'string') return broken();
  let path: string;
  try { const parts = tokens(raw); path = parts.length ? '/' + parts.map(escapeToken).join('/') : ''; } catch { return broken(); }
  const params = error.params as Record<string, unknown> | undefined;
  const key = ({ required: 'missingProperty', additionalProperties: 'additionalProperty', propertyNames: 'propertyName' } as Record<string, string>)[error.keyword];
  if (key) {
    const extra = params?.[key]; if (typeof extra !== 'string') return broken();
    return [{ keyword: error.keyword, path: path + '/' + escapeToken(extra) }];
  }
  const customKey = error.keyword === 'requiredAll' ? 'missing' : error.keyword === 'strictSchema' ? 'extra' : undefined;
  if (customKey) {
    const names = params?.[customKey];
    if (!Array.isArray(names) || names.some(n => typeof n !== 'string')) return broken();
    return names.map(n => ({ keyword: error.keyword as string, path: path + '/' + escapeToken(n as string) }));
  }
  return [{ keyword: error.keyword, path }];
}
export function normalizeSchemaErrors(errors: unknown): SchemaError[] {
  if (!Array.isArray(errors)) return broken();
  return errors.flatMap(normalizeSchemaError);
}
