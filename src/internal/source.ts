import type { SourceRef } from '../contracts/public.js';
import { violation } from '../contracts/errors.js';
import { resolve } from './pointer.js';
export function sourceValue(ref: SourceRef, materials: Record<string, unknown>): unknown {
  if (!Object.hasOwn(materials, ref.root)) violation('', 'SOURCE_INVALID');
  let found; try { found = resolve(materials[ref.root], ref.pointer); } catch { return violation('', 'SOURCE_INVALID'); }
  if (!found.found || ref.quote !== undefined && (typeof found.value !== 'string' || !found.value.includes(ref.quote))) violation('', 'SOURCE_INVALID');
  return found.value;
}
