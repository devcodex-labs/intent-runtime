import { parse } from 'bcp-47';
import registry from './data/iana-language-subtags.json' with {type: 'json'};
import extensions from './data/iana-language-extensions.json' with {type: 'json'};

// Registry data is a retained product asset, not an Intl/model language whitelist.
const subtags = new Map<string, Set<string>>();
const ranges = new Map<string, Array<[string, string]>>();
const wholeTags = new Set<string>();
const extlangPrefixes = new Map<string, string[]>();
for (const raw of registry.records) {
  const record = raw as {Type: string; Subtag?: string; Tag?: string; Prefix?: string[]};
  if (record.Tag) wholeTags.add(record.Tag.toLowerCase());
  if (!record.Subtag) continue;
  const subtag = record.Subtag.toLowerCase();
  if (record.Type === 'extlang') extlangPrefixes.set(subtag, (record.Prefix ?? []).map(prefix => prefix.toLowerCase()));
  if (subtag.includes('..')) {
    const [start, end] = subtag.split('..') as [string, string];
    const list = ranges.get(record.Type) ?? []; list.push([start, end]); ranges.set(record.Type, list);
  } else {
    const values = subtags.get(record.Type) ?? new Set<string>(); values.add(subtag); subtags.set(record.Type, values);
  }
}
function registered(kind: string, value: string): boolean {
  const normalized = value.toLowerCase();
  return Boolean(subtags.get(kind)?.has(normalized) || ranges.get(kind)?.some(([start, end]) => normalized.length === start.length && normalized >= start && normalized <= end));
}
export function validLanguage(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.trim() !== value) return false;
  if (wholeTags.has(value.toLowerCase())) return true;
  let malformed = false;
  const tag = parse(value, {warning: () => {malformed = true;}});
  if (malformed) return false;
  if (!tag.language) return tag.privateuse.length > 0;
  if (!registered('language', tag.language) || tag.script && !registered('script', tag.script) || tag.region && !registered('region', tag.region)) return false;
  if (tag.extendedLanguageSubtags.some(s => !registered('extlang', s)) || tag.variants.some(s => !registered('variant', s))) return false;
  let prefix = tag.language.toLowerCase();
  for (const extlang of tag.extendedLanguageSubtags) {
    if (!extlangPrefixes.get(extlang.toLowerCase())?.includes(prefix)) return false;
    prefix += '-' + extlang.toLowerCase();
  }
  if (new Set(tag.variants.map(s => s.toLowerCase())).size !== tag.variants.length) return false;
  const identifiers = tag.extensions.map(e => e.singleton.toLowerCase());
  return new Set(identifiers).size === identifiers.length && identifiers.every(id => extensions.identifiers.includes(id));
}

export function validReferenceTime(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parts = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.(\d+))?(Z|[+-]\d\d:\d\d)$/.exec(value);
  if (!parts) return false;
  const [year, month, day, hour, minute, second] = parts.slice(1, 7).map(Number) as [number, number, number, number, number, number];
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]! || minute > 59 || second > 59 || hour > 24) return false;
  if (hour === 24 && (minute !== 0 || second !== 0 || Number(parts[7] ?? 0) !== 0)) return false;
  const zone = parts[8]!;
  if (zone !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4, 6)) > 59)) return false;
  return Number.isFinite(Date.parse(value));
}
