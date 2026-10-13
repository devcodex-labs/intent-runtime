import { ObjectDslBuilder } from 'schema-dsl/pure';
import { types } from 'node:util';
import { IntentError } from '../contracts/errors.js';
import { measure, plain, snapshot, type JsonBoundary } from '../internal/json.js';
import type { IntentSchema, JsonObject } from '../contracts/public.js';

// Version-pinned compatibility marker; it is deliberately NOT an authentication test.
function trackedConfiguration(value: object): boolean {
  if (!types.isProxy(value)) return false;
  const state: unknown = Reflect.get(value, Symbol.for('schema-dsl.schemaCacheState'));
  if (!plain(state)) return false;
  const raw = Object.getOwnPropertyDescriptor(state, 'rawSchema');
  const version = Object.getOwnPropertyDescriptor(state, 'version');
  if (!raw || !('value' in raw) || !plain(raw.value) || !version || !('value' in version) || !Number.isSafeInteger(version.value) || version.value < 0) return false;
  const cache = Object.getOwnPropertyDescriptor(raw.value, Symbol.for('schema-dsl.schemaCacheKey'));
  return Boolean(cache && 'value' in cache && typeof cache.value === 'string' && cache.value.startsWith('schema:'));
}
export function schemaSnapshot(input: IntentSchema, maxBytes: number, maxDepth: number): JsonObject {
  const boundary: JsonBoundary = { maxBytes, maxDepth, limit: 'maxSchemaBytes', stage: 'config', invalid: 'SCHEMA_UNSUPPORTED_FOR_EXTRACTION', schemaProxy: trackedConfiguration, schemaCache: true };
  let declaration: unknown = input;
  if (input instanceof ObjectDslBuilder) {
    if (types.isProxy(input)) throw new IntentError('SCHEMA_UNSUPPORTED_FOR_EXTRACTION', { stage: 'config' });
    const d = Object.getOwnPropertyDescriptor(input, '_schema');
    if (!d || !('value' in d)) throw new IntentError('SCHEMA_INVALID', { stage: 'config' });
    for (const key of Reflect.ownKeys(input)) {
      const property = Object.getOwnPropertyDescriptor(input, key);
      if (typeof key === 'symbol' || !property || !('value' in property) || typeof property.value === 'function') throw new IntentError('SCHEMA_UNSUPPORTED_FOR_EXTRACTION', { stage: 'config' });
    }
    measure(d.value, boundary);
    declaration = ObjectDslBuilder.prototype.toSchema.call(input);
  }
  const result = snapshot(declaration, boundary);
  if (!plain(result) || result.type !== 'object' || !plain(result.properties)) throw new IntentError('SCHEMA_INVALID', { stage: 'config' });
  return result as JsonObject;
}
