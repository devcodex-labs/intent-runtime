import { fail } from '../contracts/errors.js';
import { plain } from '../internal/json.js';
import type { JsonValue } from '../contracts/public.js';

function keys(value: unknown, allowed: string[]): asserts value is Record<string, JsonValue> {
  if (!plain(value) || Object.keys(value).some(key => !allowed.includes(key))) fail('CONFIG_INVALID');
}
function strings(value: unknown): boolean {return Array.isArray(value) && value.every(item => typeof item === 'string');}
export function validateSemantics(value: unknown): void {
  keys(value, ['domain', 'description', 'terms', 'actions']);
  for (const key of ['domain', 'description']) if (value[key] !== undefined && typeof value[key] !== 'string') fail('CONFIG_INVALID');
  for (const kind of ['terms', 'actions'] as const) {
    const entries = value[kind]; if (entries === undefined) continue;
    if (!Array.isArray(entries)) fail('CONFIG_INVALID');
    const meanings = new Map<string, string>();
    for (const entry of entries) {
      const lists = kind === 'terms' ? ['aliases'] : ['examples', 'counterExamples'];
      keys(entry, ['name', 'meaning', ...lists]);
      if (typeof entry.name !== 'string' || !entry.name.trim() || typeof entry.meaning !== 'string' || !entry.meaning.trim()) fail('CONFIG_INVALID');
      for (const key of lists) if (entry[key] !== undefined && !strings(entry[key])) fail('CONFIG_INVALID');
      if (meanings.has(entry.name) && meanings.get(entry.name) !== entry.meaning) fail('CONFIG_INVALID');
      meanings.set(entry.name, entry.meaning);
    }
  }
}
