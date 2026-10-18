import ts from 'typescript';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repo = fileURLToPath(new URL('../../', import.meta.url));
export const normalizeText = text => text.replace(/\r\n?/g, '\n');
export function documentationBlocks(text, kind) {
  const value = normalizeText(text).replace(/\{\/\*\s*((?:example|javascript|typecheck|result|json)\b[^\n]*?)\s*\*\/\}/g, '<!-- $1 -->');
  const patterns = {
    example: /<!-- example: ([\w/.-]+) -->\s*```(?:js|ts)\n([\s\S]*?)\n```/g,
    javascript: /<!-- javascript: ([\w/.-]+) -->\s*```js\n([\s\S]*?)\n```/g,
    typecheck: /<!-- typecheck -->\s*```ts\n([\s\S]*?)\n```/g,
    result: /<!-- result: ([\w-]+) -->\s*```json\n([\s\S]*?)\n```/g,
    json: /<!-- json: ([\w-]+) -->\s*```json\n([\s\S]*?)\n```/g,
  };
  if (!Object.hasOwn(patterns, kind)) throw new Error('Unknown documentation block kind: ' + kind);
  const markers = [...value.matchAll(new RegExp('<!--\\s*' + kind + '(?:\\s*:|\\s*-->)', 'g'))];
  const blocks = [...value.matchAll(patterns[kind])];
  if (markers.length !== blocks.length) throw new Error('Unmatched documentation marker: ' + kind);
  return blocks;
}
export function checkPublicTypes(source, markdown) {
  const types = normalizeText(source).replace(/^\/\/ Public contract:[^\n]*\n/, '').trimStart();
  if (!normalizeText(markdown).includes(types)) throw new Error('Root public type reference is stale.');
}
export function checkTypeSnippet(code) {
  const file = path.join(repo, 'website/__documentation_typecheck__.ts');
  const options = {strict: true, noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, baseUrl: repo,
    paths: {'@devcodex/intent-runtime': ['src/index.ts'], '@devcodex/intent-runtime/adapters/api': ['src/adapters/api.ts'], '@devcodex/intent-runtime/mcp': ['src/mcp/index.ts']}};
  const host = ts.createCompilerHost(options), read = host.readFile.bind(host), exists = host.fileExists.bind(host);
  host.readFile = name => path.normalize(name) === path.normalize(file) ? code : read(name);
  host.fileExists = name => path.normalize(name) === path.normalize(file) || exists(name);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([file], options, host));
  if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {getCurrentDirectory: () => repo, getCanonicalFileName: name => name, getNewLine: () => '\n'}));
}

// Keep this limited to the public Result reference. Human review still checks
// meaning; a word appearing somewhere in an example does not document a path.
export function checkResponseFields(source, markdown) {
  const tree = ts.createSourceFile('public.ts', source, ts.ScriptTarget.Latest, true);
  const aliases = new Map(tree.statements.filter(ts.isTypeAliasDeclaration).map(n => [n.name.text, n.type]));
  const paths = {
    IntentResult: '', TurnUnderstanding: 'turn', EffectiveIntentSnapshot: 'effective', StructuredIntent: 'I',
    IntentConstraint: 'C', ConstraintScope: 'C.scope', StructuredExpression: 'E', ExpressionOperand: 'O',
    IntentReference: 'R', IntentRelation: 'effective.relations[]', IntentChange: 'turn.changes[]',
    ChangeTarget: 'turn.changes[].target', IntentDelta: 'turn.changes[].deltas[]', FieldResult: 'fieldResults[]',
    IntentIssue: 'Q', IntentCandidate: 'Q.candidates[]', IntentInference: 'inferences[]', SourceRef: 'S',
    IntentSuggestion: 'suggestions[]', SourceEvidence: 'evidence[]', IntentDiagnostics: 'diagnostics',
  };
  const rows = new Map();
  for (const line of normalizeText(markdown).split('\n').filter(l => l.startsWith('| '))) {
    const cells = line.slice(1, -1).split('|').map(s => s.trim().replace(/`/g, ''));
    if (cells.length === 4) rows.set(cells[0], cells);
  }
  function members(type) {
    if (ts.isTypeLiteralNode(type)) return type.members;
    if (ts.isUnionTypeNode(type) || ts.isIntersectionTypeNode(type)) return type.types.flatMap(members);
    if (ts.isTypeReferenceNode(type) && aliases.has(type.typeName.getText(tree))) return members(aliases.get(type.typeName.getText(tree)));
    return [];
  }
  const checked = new Set();
  const requireRow = full => {
    const row = rows.get(full);
    if (!row || row.slice(1).some(cell => cell.length === 0) || row[3].length < 4) throw new Error('Missing result contract row (path/type/presence/meaning): ' + full);
    checked.add(full);
  };
  for (const [name, prefix] of Object.entries(paths)) {
    if (!aliases.has(name)) throw new Error('Public type disappeared: ' + name);
    for (const member of members(aliases.get(name))) {
      if (!member.name) continue;
      const full = (prefix ? prefix + '.' : '') + member.name.getText(tree);
      requireRow(full);
      // questions is an inline object array, not a separately named public type.
      const element = ts.isArrayTypeNode(member.type) ? member.type.elementType : ts.isTypeReferenceNode(member.type) && member.type.typeName.getText(tree) === 'Array' ? member.type.typeArguments?.[0] : undefined;
      if (name === 'IntentIssue' && element && ts.isTypeLiteralNode(element)) {
        for (const child of element.members) requireRow(full + '[].' + child.name.getText(tree));
      }
    }
  }
  return checked.size;
}
