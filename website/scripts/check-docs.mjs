import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('content'); const files = [];
async function scan(dir) {for (const entry of await readdir(dir, {withFileTypes: true})) {const p = path.join(dir, entry.name); if (entry.isDirectory()) await scan(p); else if (/\.(md|mdx)$/.test(p)) files.push(p);}}
await scan(root);
const routes = new Set(files.map(f => '/' + path.relative(root, f).replace(/\\/g, '/').replace(/\.(md|mdx)$/, '')));
let links = 0;
for (const file of [...files, path.resolve('../README.md'), path.resolve('rspress.config.ts')]) {
  const text = await readFile(file, 'utf8');
  if (/开发预览|Intent\.bridge|coreJson|dataJson|setup codex|自动配置检测到|\/api\/bridge-mcp/.test(text)) throw new Error('Obsolete documentation: ' + file);
  for (const match of text.matchAll(/(?:\]\(|link:\s*['"]?)(\/(?:guide|api|integrations|examples|testing)\/[A-Za-z0-9_/-]+)/g)) {
    if (!routes.has(match[1])) throw new Error('Missing documentation route: ' + match[1]); links++;
  }
}
const response = await readFile(path.join(root, 'api/response.md'), 'utf8'), types = await readFile('../src/contracts/public.ts', 'utf8');
for (const section of ['IntentResult', 'FieldResult', 'IntentChangeBase', 'IntentRelation', 'IntentConstraint']) {
  const body = new RegExp('export type ' + section + ' = \\{([\\s\\S]*?)\\n\\};').exec(types)?.[1];
  if (!body) throw new Error('Missing reference type: ' + section);
  for (const field of body.matchAll(/^\s+(\w+)\??:/gm)) if (!response.includes(field[1])) throw new Error('Undocumented public field: ' + field[1]);
}
for (const name of ['precondition','depends_on','parallel','exclusive']) if (!response.includes(name)) throw new Error('Undocumented public variant: ' + name);
const nativeTypes = await readFile('../src/contracts/public.ts', 'utf8'), documentedTypes = await readFile(path.join(root, 'api/types.md'), 'utf8');
if (!documentedTypes.includes(nativeTypes)) throw new Error('Complete public type reference is stale.');
console.log(`V2 documentation routes and references checked: ${files.length} pages, ${links} links.`);
