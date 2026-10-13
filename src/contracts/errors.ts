import type { CandidateViolationCode, IntentErrorCode, IntentErrorOptions, IntentErrorStage, IntentResult, SerializedIntentError, ErrorSerializationOptions } from './public.js';

const messages: Record<IntentErrorCode, string> = {
  INPUT_INVALID: 'Invalid input.', CONFIG_INVALID: 'Invalid configuration.', FIELD_UNKNOWN: 'Unknown selected field.',
  SCHEMA_INVALID: 'Invalid schema.', SCHEMA_NOT_CONFIGURED: 'Schema not configured.', SCHEMA_UNSUPPORTED_FOR_EXTRACTION: 'Schema is outside the declared support range.',
  EXECUTOR_NOT_CONFIGURED: 'Model executor not configured.', MODEL_AUTH_FAILED: 'Model authentication failed.', MODEL_RATE_LIMITED: 'Model service rate limited.',
  MODEL_REQUEST_FAILED: 'Model request failed.', MODEL_REFUSED: 'Model refused.', MODEL_OUTPUT_INCOMPLETE: 'Model output is incomplete.', MODEL_OUTPUT_INVALID: 'Model output is invalid.',
  MODEL_TIMEOUT: 'Recognition timed out.', REQUEST_ABORTED: 'Recognition cancelled.', INSTANCE_DISPOSED: 'Instance disposed.', RESOURCE_LIMIT: 'Resource limit exceeded.',
  INTERNAL_PROCESSING_FAILED: 'Internal processing failed.', HOST_REQUEST_NOT_FOUND: 'Host request not found.', HOST_SUBMISSION_CONFLICT: 'Host submission conflict.',
};
function defaultStage(code: IntentErrorCode): IntentErrorStage {
  if (code === 'INTERNAL_PROCESSING_FAILED') return 'validation';
  if (code.startsWith('HOST_')) return 'transport';
  if (code.startsWith('MODEL_') || code === 'REQUEST_ABORTED') return 'model';
  if (code === 'CONFIG_INVALID' || code === 'SCHEMA_INVALID' || code === 'SCHEMA_UNSUPPORTED_FOR_EXTRACTION') return 'config';
  return 'input';
}
export class IntentError extends Error {
  readonly code: IntentErrorCode;
  readonly stage: IntentErrorStage;
  readonly details?: IntentErrorOptions['details'];
  readonly partialResult?: IntentResult;
  override readonly cause?: unknown;
  constructor(code: IntentErrorCode, options: IntentErrorOptions = {}) {
    if (!Object.hasOwn(messages, code)) throw new TypeError('Unknown IntentError code');
    super(messages[code]);
    this.name = 'IntentError'; this.code = code; this.stage = options.stage ?? defaultStage(code);
    if (options.details) this.details = structuredClone(options.details);
    Object.defineProperty(this, 'cause', { value: options.cause, enumerable: false, writable: false, configurable: false });
  }
  toJSON(): SerializedIntentError { return this.serialize(); }
  serialize(options: ErrorSerializationOptions = {}): SerializedIntentError {
    return { name: 'IntentError', code: this.code, message: this.message, stage: this.stage,
      ...(this.details ? { details: structuredClone(this.details) } : {}),
      ...(options.includePartialResult && this.partialResult ? { partialResult: structuredClone(this.partialResult) } : {}) };
  }
}
export function fail(code: IntentErrorCode, stage?: IntentErrorStage, path?: string): never {
  throw new IntentError(code, { ...(stage ? { stage } : {}), ...(path !== undefined ? { details: { path } } : {}) });
}
export function violation(path = '', rule: CandidateViolationCode = 'STRUCTURE'): never {
  throw new IntentError('MODEL_OUTPUT_INVALID', { stage: 'validation', details: { violations: [{ rule, path: path.slice(0, 512).replace(/[^\x20-\x7e]/g, '*') }] } });
}
