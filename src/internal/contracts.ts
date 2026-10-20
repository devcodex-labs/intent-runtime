import { Validator, type JSONSchema } from 'schema-dsl/pure';
import { violation } from '../contracts/errors.js';
import { escapeToken } from './pointer.js';
export class ContractValidator {
  private readonly validator = new Validator({logger: false, strict: false, useDefaults: false, coerceTypes: false, removeAdditional: false, cache: false, allErrors: true});
  valid(schema: object, value: unknown): boolean {
    return this.validator.validate(schema as JSONSchema, value, {smartCoerce: false, coerce: false, format: false}).valid;
  }
  candidate(schema: object, value: unknown, path = ''): void {
    const result = this.validator.validate(schema as JSONSchema, value, {smartCoerce: false, coerce: false, format: false});
    if (result.valid) return;
    // pure Validator returns AJV errors; only expose a bounded pointer, never data.
    const error = result.errors?.[0] as {instancePath?: unknown; keyword?: string; params?: Record<string, unknown>} | undefined;
    let pointer = typeof error?.instancePath === 'string' ? error.instancePath : '';
    const property = error?.keyword === 'required' ? error.params?.missingProperty : error?.keyword === 'additionalProperties' ? error.params?.additionalProperty : undefined;
    if (typeof property === 'string') pointer += '/' + escapeToken(property);
    // An explicit path identifies an opaque JSON-string slot in the original
    // candidate; decoded fragment properties are not traversable payload paths.
    violation(path || pointer, 'STRUCTURE');
  }
  close(): void { this.validator.clearCache(); }
}
