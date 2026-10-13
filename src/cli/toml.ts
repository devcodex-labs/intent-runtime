import {parseForESLint, getStaticTOMLValue} from 'toml-eslint-parser';

export class ProtectionConflict extends Error {constructor() {super('Owned registration changed or layout cannot be edited safely.');}}
export interface TableRange {start: number; end: number; text: string}
export function tableRange(text: string, name: string): TableRange | undefined {
  let ast: ReturnType<typeof parseForESLint>['ast'];
  try {ast = parseForESLint(text).ast;} catch {throw new ProtectionConflict();}
  const tables = ast.body[0].body.filter(t => t.type === 'TOMLTable' && t.resolvedKey[0] === 'mcp_servers' && t.resolvedKey[1] === name);
  if (tables.some(t => t.type === 'TOMLTable' && (t.resolvedKey.length !== 2 || t.kind !== 'standard')) || tables.length > 1) throw new ProtectionConflict();
  const table = tables[0];
  if (!table) {
    const root = getStaticTOMLValue(ast) as Record<string, unknown>, servers = root.mcp_servers;
    if (servers && typeof servers === 'object' && Object.hasOwn(servers, name)) throw new ProtectionConflict();
    return undefined;
  }
  const start = table.range[0], lineEnd = text.indexOf('\n', table.range[1]);
  const end = lineEnd < 0 ? text.length : lineEnd + 1;
  return {start, end, text: text.slice(start, end)};
}
export function replaceTable(text: string, name: string, expected: string | undefined, next: string | undefined, separator = ''): string {
  const range = tableRange(text, name);
  if (range?.text !== expected) throw new ProtectionConflict();
  if (range) {
    const start = next === undefined && separator && text.slice(range.start - separator.length, range.start) === separator ? range.start - separator.length : range.start;
    return text.slice(0, start) + (next ?? '') + text.slice(range.end);
  }
  if (next === undefined) return text;
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const join = text.length ? text.endsWith('\n') ? eol : eol + eol : '';
  return text + join + next;
}
