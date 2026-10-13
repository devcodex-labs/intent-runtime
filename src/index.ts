export { Intent } from './intent.js';
export { IntentError } from './contracts/errors.js';
import { INTENT_RESULT_SCHEMA as resultSchema } from './contracts/generated.js';
import type {JsonObject} from './contracts/public.js';
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {Object.values(value).forEach(freeze); Object.freeze(value);}
  return value;
}
export const INTENT_RESULT_SCHEMA: Readonly<JsonObject> = freeze(resultSchema) as unknown as Readonly<JsonObject>;
export type * from './contracts/public.js';
