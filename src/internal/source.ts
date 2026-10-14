import type { SourceRef } from '../contracts/public.js';
import { violation } from '../contracts/errors.js';
import { resolve } from './pointer.js';
export function sourceValue(ref: SourceRef, materials: Record<string, unknown>, path = ''): unknown {
  if (!Object.hasOwn(materials, ref.root)) violation(path + '/root', 'SOURCE_INVALID');
  let found; try { found = resolve(materials[ref.root], ref.pointer); } catch { return violation(path + '/pointer', 'SOURCE_INVALID'); }
  if (!found.found) violation(path + '/pointer', 'SOURCE_INVALID');
  if (ref.quote !== undefined && (typeof found.value !== 'string' || !found.value.includes(ref.quote))) violation(path + '/quote', 'SOURCE_INVALID');
  return found.value;
}
