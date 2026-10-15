import {readFile, readdir, access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

const website = fileURLToPath(new URL('../', import.meta.url)), repo = path.resolve(website, '..'), root = path.join(website, 'content');
const files = [];
async function scan(dir) {for (const entry of await readdir(dir, {withFileTypes: true})) {const p = path.join(dir, entry.name); if (entry.isDirectory()) await scan(p); else if (/\.(md|mdx)$/.test(p)) files.push(p);}}
await scan(root);
const pages = new Map(await Promise.all(files.map(async file => ['/' + path.relative(root, file).replace(/\\/g, '/').replace(/\.(md|mdx)$/, ''), {file, text: await readFile(file, 'utf8')}])));
pages.set('/', pages.get('/index'));
const fail = message => {throw new Error(message);};
const slug = text => text.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
function anchors(text) {return new Set([...text.matchAll(/^#{1,6}\s+(.+)$/gm)].map(m => slug(m[1])));}
let links = 0, examples = 0;
const readme = path.join(repo, 'README.md'), config = path.join(website, 'rspress.config.ts');
for (const file of [...files, readme, config]) {
  const text = await readFile(file, 'utf8');
  if (/开发预览|Intent\.bridge|coreJson|dataJson|setup codex|\/api\/bridge-mcp|TDR-\d|TAF-\d|DEV-\d|GATE-\d|codex-temp|PrototypeCoverageError|Usage Contract v\d/.test(text)) fail('Obsolete or internal documentation: ' + file);
  const prose = text.replace(/```[\s\S]*?```/g, '');
  const targets = [...prose.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map(m => m[1]);
  targets.push(...[...prose.matchAll(/withBase\(['"](\/[^'"]+)['"]\)/g)].map(m => m[1]));
  targets.push(...[...prose.matchAll(/href=["'](\/intent-runtime\/[^"']+)["']/g)].map(m => m[1].slice('/intent-runtime'.length)));
  targets.push(...[...text.matchAll(/\blink:\s*['"]?(\/[^\s'"},]+)/g)].map(m => m[1]));
  for (const target of targets) {
    if (/^(https?:|mailto:)/.test(target)) continue;
    const [raw, hash] = target.split('#'), pathname = decodeURIComponent(raw ?? '');
    let destination;
    if (!pathname) destination = {file, text};
    else if (pathname.startsWith('/')) {
      destination = pages.get(pathname.replace(/\.html$/, ''));
      if (!destination) {const asset = path.join(root, 'public', pathname); try {await access(asset);} catch {fail('Missing page/asset: ' + target + ' in ' + file);} if (hash) fail('Asset fragment must be checked separately: ' + target);}
    } else {
      const candidate = path.resolve(path.dirname(file), pathname);
      try {await access(candidate);} catch {fail('Missing relative link: ' + target + ' in ' + file);}
      if (/\.(md|mdx)$/.test(candidate)) destination = {file: candidate, text: await readFile(candidate, 'utf8')};
    }
    if (hash && destination && !anchors(destination.text).has(decodeURIComponent(hash))) fail('Missing anchor: ' + target + ' in ' + file);
    links++;
  }
  for (const match of text.matchAll(/<!-- example: ([\w/.-]+) -->\s*```(?:js|ts)\n([\s\S]*?)\n```/g)) {
    const source = await readFile(path.join(repo, match[1]), 'utf8');
    if (match[2].trimEnd() !== source.trimEnd()) fail('Stale executable example: ' + match[1] + ' in ' + file);
    examples++;
  }
}
const typeReference = pages.get('/api/types').text;
const native = await readFile(path.join(repo, 'src/contracts/public.ts'), 'utf8');
const publicTypes = native.replace(/^\/\/ Public contract:[^\n]*\n/, '').trimStart();
if (!typeReference.includes(publicTypes)) fail('Root public type reference is stale.');
const norm = value => value.replace(/\b(export|declare)\s+/g, '').replace(/\s|;/g, '');
function declarations(source) {
  const tree = ts.createSourceFile('types.ts', source, ts.ScriptTarget.Latest, true);
  return tree.statements.filter(n => ts.isTypeAliasDeclaration(n) || ts.isInterfaceDeclaration(n) || ts.isFunctionDeclaration(n)).map(n => {
    if (!n.name) return null;
    const text = n.getText(tree), signature = ts.isFunctionDeclaration(n) && n.body ? text.slice(0, text.indexOf('{')) : text;
    return [n.name.getText(tree), norm(signature)];
  }).filter(Boolean);
}
const blocks = [...typeReference.matchAll(/```ts\n([\s\S]*?)\n```/g)].map(m => m[1]);
const declared = new Map(blocks.flatMap(declarations));
let publicDeclarations = 0;
for (const sourceFile of ['src/adapters/api.ts', 'src/mcp/index.ts']) {
  const source = await readFile(path.join(repo, sourceFile), 'utf8');
  const tree = ts.createSourceFile(sourceFile, source, ts.ScriptTarget.Latest, true);
  for (const node of tree.statements.filter(n => n.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword))) {
    for (const [name, signature] of declarations(node.getText(tree))) {
      if (declared.get(name) !== signature) fail('Stale public declaration: ' + name);
      publicDeclarations++;
    }
  }
}
const maintenance = await readFile(path.join(repo, 'src/cli/maintenance.ts'), 'utf8');
const report = declarations(maintenance).find(([name]) => name === 'MaintenanceReport');
if (!report || declared.get(report[0]) !== report[1]) fail('Stale CLI MaintenanceReport shape.');
const maintenanceDoc = pages.get('/guide/installation').text;
const commandSource = await readFile(path.join(repo, 'src/cli/index.ts'), 'utf8');
const flags = new Set([...commandSource.matchAll(/['"](--[a-z-]+)['"]/g)].map(m => m[1]));
for (const flag of flags) if (!maintenanceDoc.includes(flag)) fail('Missing CLI flag: ' + flag);
const nativeApi = pages.get('/api/intent').text;
for (const name of ['constructor','parse','dispose','toJSON','serialize','includePartialResult','INTENT_RESULT_SCHEMA']) if (!nativeApi.includes(name)) fail('Missing Native API method/option: ' + name);
const defaults = await readFile(path.join(repo, 'src/intent.ts'), 'utf8');
const limitBody = /DEFAULT_LIMITS[^\n]+Object\.freeze\(\{([^}]+)\}/.exec(defaults)?.[1];
if (!limitBody) fail('Cannot locate limit defaults.');
const configuration = pages.get('/guide/configuration').text;
for (const [, name, value] of limitBody.matchAll(/(\w+):\s*(\d+)/g)) {
  if (!configuration.split('\n').some(line => line.startsWith('| ' + name + ' |') && line.includes('| ' + value + ' |'))) fail('Incorrect limit documentation: ' + name);
}
for (const name of ['language','executor','schema','extensionSchema','semantics','timeoutMs','defaultOutput','limits','suggestions','evidence','diagnostics','extensions']) {
  if (!configuration.split('\n').some(line => line.startsWith('| ' + name + ' |'))) fail('Missing configuration: ' + name);
}
const api = await readFile(path.join(repo, 'src/adapters/api.ts'), 'utf8'), apiDoc = pages.get('/integrations/api').text;
for (const name of ['provider','model','apiKey','baseURL','maxOutputTokens','maxResponseBytes','format']) if (!apiDoc.split('\n').some(line => line.startsWith('| ' + name + ' |'))) fail('Missing API config: ' + name);
for (const name of ['maxOutputTokens','maxResponseBytes']) {
  const value = new RegExp(name + ' = data\\.' + name + ' \\?\\? (\\d+)').exec(api)?.[1];
  if (!value || !apiDoc.split('\n').some(line => line.startsWith('| ' + name + ' |') && line.includes('| ' + value + ' |'))) fail('Incorrect API default: ' + name);
}
const response = pages.get('/api/response').text;
for (const name of ['IntentResult','FieldResult','IntentChangeBase','IntentRelation','IntentConstraint','StructuredIntent','TurnUnderstanding','SourceRef']) {
  const tree = ts.createSourceFile('native.ts', native, ts.ScriptTarget.Latest, true);
  const node = tree.statements.find(n => ts.isTypeAliasDeclaration(n) && n.name.text === name);
  for (const field of node?.type?.members ?? []) if (field.name && !response.includes(field.name.getText(tree))) fail('Undocumented result field: ' + name + '.' + field.name.getText(tree));
}
for (const name of ['present','explicit_null','not_provided','unknown','not_applicable','invalid','invalidated','removed','precondition','depends_on','parallel','exclusive']) if (!response.includes(name)) fail('Missing response variant: ' + name);
const versionSource = await readFile(path.join(website, 'site.ts'), 'utf8');
if (!versionSource.includes('version = metadata.version;')) fail('Document the full package version.');
if (!pages.has('/guide/multi-turn')) fail('Missing multi-turn guide.');
console.log(`User documentation checked: ${files.length} pages, ${links} links/assets/anchors, ${examples} exact examples, ${publicDeclarations} API/MCP declarations, CLI report and configuration defaults.`);
