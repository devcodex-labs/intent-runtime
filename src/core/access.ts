import type { IntentParseRequest, IntentParseOptions, IntentResult, ModelRequest } from '../contracts/public.js';
import type { IntentError } from '../contracts/errors.js';

// Shared by the Native and MCP entries through one build chunk. No global
// registry, runtime discovery or public lifecycle API is added to Intent.
export interface RecognitionLease {
  readonly request: ModelRequest;
  readonly terminated: Promise<IntentError>;
  accept(text: string): Promise<IntentResult>;
  hold<T>(work: () => Promise<T>): Promise<T>;
  close(): void;
  abort(error: IntentError): void;
  assertActive(): void;
  measureTask(value: unknown): void;
}
export interface IntentAccess {
  assertAvailable(executor: boolean): void;
  prepare(request: IntentParseRequest, options?: IntentParseOptions): RecognitionLease;
}
export const intentAccess = new WeakMap<object, IntentAccess>();
