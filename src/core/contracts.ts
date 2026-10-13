import { Validator, type JSONSchema } from 'schema-dsl/pure';
import { violation } from '../contracts/errors.js';
export class ContractValidator {
  private readonly validator = new Validator({strict: false, useDefaults: false, coerceTypes: false, removeAdditional: false, cache: false, allErrors: true});
  valid(schema: object, value: unknown): boolean {
    return this.validator.validate(schema as JSONSchema, value, {smartCoerce: false, coerce: false, format: false}).valid;
  }
  candidate(schema: object, value: unknown): void { if (!this.valid(schema, value)) violation('', 'STRUCTURE'); }
  close(): void { this.validator.clearCache(); }
}
