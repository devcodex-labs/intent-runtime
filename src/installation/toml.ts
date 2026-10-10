import { parseForESLint, getStaticTOMLValue, type AST } from "toml-eslint-parser";
import { InstallError, digest } from "./files.js";

type Path = string[];
type Entry = { path: Path; node: AST.TOMLKeyValue };
function key(node: AST.TOMLKey): string[] { return node.keys.map(k => k.type === "TOMLBare" ? k.name : k.value); }
function prefix(a: Path, b: Path): boolean { return a.length <= b.length && a.every((v, i) => v === b[i]); }
function equal(a: Path, b: Path): boolean { return a.length === b.length && prefix(a, b); }
function parsed(source: string) {
  try {
    const ast = parseForESLint(source, { tomlVersion: "1.0" }).ast;
    const data = getStaticTOMLValue(ast) as Record<string, unknown>;
    const entries: Entry[] = [];
    const tables: AST.TOMLTable[] = [];
    function walk(body: (AST.TOMLKeyValue | AST.TOMLTable)[], base: Path) {
      for (const node of body) {
        if (node.type === "TOMLTable") {
          if (node.resolvedKey.some(v => typeof v !== "string")) continue;
          tables.push(node);
          walk(node.body, node.resolvedKey as Path);
        } else {
          const path = [...base, ...key(node.key)];
          entries.push({ path, node });
          if (node.value.type === "TOMLInlineTable") walk(node.value.body, path);
        }
      }
    }
    walk(ast.body[0]!.body, []);
    return { ast, data, entries, tables };
  } catch { throw new InstallError("TOML_INVALID", "Client config.toml is invalid. Restore or correct the file before configuring MCP."); }
}
function literal(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return "[" + value.map(literal).join(", ") + "]";
  if (value && typeof value === "object") return "{ " + Object.entries(value).map(([k, v]) => JSON.stringify(k) + " = " + literal(v)).join(", ") + " }";
  throw new InstallError("TOML_VALUE_INVALID", "Unsupported value in the MCP configuration.");
}
function set(source: string, path: Path, value: unknown): string {
  const { entries, tables } = parsed(source);
  const existing = entries.find(e => equal(e.path, path));
  if (existing) return source.slice(0, existing.node.value.range[0]) + literal(value) + source.slice(existing.node.value.range[1]);
  const inline = entries.filter(e => prefix(e.path, path) && e.node.value.type === "TOMLInlineTable").sort((a, b) => b.path.length - a.path.length)[0];
  if (inline && inline.node.value.type === "TOMLInlineTable") {
    const offset = inline.node.value.range[1] - 1;
    const text = (inline.node.value.body.length ? ", " : "") + path.slice(inline.path.length).map(v => JSON.stringify(v)).join(".") + " = " + literal(value);
    return source.slice(0, offset) + text + source.slice(offset);
  }
  const table = tables.filter(t => prefix(t.resolvedKey as Path, path)).sort((a, b) => b.resolvedKey.length - a.resolvedKey.length)[0];
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  let offset: number;
  if (table) { const end = source.indexOf("\n", table.range[1]); offset = end === -1 ? source.length : end + 1; }
  else offset = tables[0]?.range[0] ?? source.length;
  const relative = path.slice(table?.resolvedKey.length ?? 0).map(v => JSON.stringify(v)).join(".");
  const text = (offset && source[offset - 1] !== "\n" ? newline : "") + relative + " = " + literal(value) + newline;
  return source.slice(0, offset) + text + source.slice(offset);
}
export function servers(source: string): Record<string, unknown> {
  const value = parsed(source).data.mcp_servers;
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InstallError("MCP_CONFIG_INVALID", "mcp_servers must be a TOML table.");
  return value as Record<string, unknown>;
}
export function configuration(source: string): Record<string, unknown> { return parsed(source).data; }
export function upsert(source: string, name: string, fields: Record<string, unknown>): string {
  const data = parsed(source);
  if (!Object.hasOwn(servers(source), name) && !data.entries.some(e => equal(e.path, ["mcp_servers"]) && e.node.value.type === "TOMLInlineTable")) {
    const newline = source.includes("\r\n") ? "\r\n" : "\n";
    source += (source && !source.endsWith("\n") ? newline : "") + "[mcp_servers." + JSON.stringify(name) + "]" + newline;
  }
  for (const [field, value] of Object.entries(fields)) source = set(source, ["mcp_servers", name, field], value);
  servers(source);
  return source;
}
export function fingerprint(source: string, name: string): string {
  const { entries, tables } = parsed(source);
  const target = ["mcp_servers", name];
  const parts = entries.filter(e => prefix(target, e.path)).map(e => source.slice(...e.node.range));
  parts.push(...tables.filter(t => prefix(target, t.resolvedKey as Path)).map(t => source.slice(t.range[0], t.key.range[1])));
  return digest(JSON.stringify(parts));
}
function removalRange(source: string, start: number, end: number): [number, number] {
  const lineStart = source.lastIndexOf("\n", start - 1) + 1;
  const newline = source.indexOf("\n", end);
  const lineEnd = newline === -1 ? source.length : newline;
  // Remove the line break only when the line has no surrounding user content.
  if (/^[ \t\r]*$/.test(source.slice(lineStart, start)) && /^[ \t\r]*$/.test(source.slice(end, lineEnd)))
    return [lineStart, newline === -1 ? lineEnd : newline + 1];
  return [start, end];
}
export function remove(source: string, name: string): string {
  const { entries, tables } = parsed(source);
  const target = ["mcp_servers", name];
  const inline = entries.find(e => prefix(target, e.path) && e.node.parent.type === "TOMLInlineTable");
  if (inline && inline.node.parent.type === "TOMLInlineTable") {
    const siblings = inline.node.parent.body;
    const index = siblings.indexOf(inline.node);
    let [start, end] = inline.node.range;
    if (index > 0) start = siblings[index - 1]!.range[1];
    else if (siblings.length > 1) end = siblings[1]!.range[0];
    source = source.slice(0, start) + source.slice(end);
    if (Object.hasOwn(servers(source), name)) return remove(source, name);
  } else {
    const ranges: [number, number][] = entries.filter(e => prefix(target, e.path) && !entries.some(parent => parent !== e && prefix(target, parent.path) && parent.node.range[0] <= e.node.range[0] && parent.node.range[1] >= e.node.range[1])).map(e => e.node.range);
    for (const t of tables.filter(t => prefix(target, t.resolvedKey as Path))) {
      // Keep comments beside a header; comment-free lines can be removed whole.
      const end = source.indexOf("]", t.key.range[1]) + 1;
      ranges.push([t.range[0], end]);
    }
    const removals = ranges.map(([start, end]) => removalRange(source, start, end));
    for (const [start, end] of removals.sort((a, b) => b[0] - a[0])) source = source.slice(0, start) + source.slice(end);
  }
  parsed(source);
  return source;
}
