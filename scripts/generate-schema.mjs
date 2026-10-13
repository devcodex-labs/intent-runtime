import * as TJS from 'typescript-json-schema';
import { writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
const options = JSON.parse(readFileSync('tsconfig.json', 'utf8')).compilerOptions;
const program = TJS.getProgramFromFiles([path.resolve('src/contracts/public.ts'), path.resolve('src/model/candidate.ts')], {...options, strictNullChecks: true}, process.cwd());
const names = {INTENT_RESULT_SCHEMA: 'IntentResult', BASELINE_SCHEMA: 'EffectiveIntentSnapshot', CANDIDATE_SCHEMA: 'CandidateDraft', EXPRESSION_SCHEMA: 'StructuredExpression'};
// Equivalent primitive union spelling avoids dependency strictTypes logging.
function primitiveUnions(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return;
  if (Array.isArray(schema.type)) {const union = {anyOf: schema.type.map(type => ({type}))}; delete schema.type; (schema.allOf ??= []).push(union);}
  for (const key of ['properties', 'definitions', 'patternProperties']) Object.values(schema[key] ?? {}).forEach(primitiveUnions);
  for (const key of ['allOf', 'anyOf', 'oneOf']) (schema[key] ?? []).forEach(primitiveUnions);
  for (const key of ['items', 'additionalProperties', 'not', 'if', 'then', 'else']) primitiveUnions(schema[key]);
}
// TJS can name definitions using absolute import(...) types. URI-encoding a
// slash inside such a key does not make it a valid JSON Pointer token: fragment
// decoding happens before pointer evaluation. Use portable local identifiers.
function localDefinitions(schema) {
  const names = new Map(Object.keys(schema.definitions ?? {}).map((name, i) => [name, 'D' + i]));
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (typeof value.$ref === 'string') {
      if (!value.$ref.startsWith('#/definitions/')) throw new Error('Unexpected generated reference');
      const name = decodeURIComponent(value.$ref.slice('#/definitions/'.length));
      const target = names.get(name); if (!target) throw new Error('Unresolved generated reference');
      value.$ref = '#/definitions/' + target;
    }
    Object.values(value).forEach(visit);
  }
  visit(schema);
  if (schema.definitions) schema.definitions = Object.fromEntries(Object.entries(schema.definitions).map(([name, rule]) => [names.get(name), rule]));
}
let result = '// Generated from public and candidate TypeScript types; run npm run schema:generate.\n';
for (const [name, type] of Object.entries(names)) {
  const schema = TJS.generateSchema(program, type, {required: true, noExtraProps: true, ignoreErrors: false, ref: true});
  if (!schema) throw new Error('Cannot generate ' + type);
  primitiveUnions(schema);
  localDefinitions(schema);
  result += `export const ${name} = ${JSON.stringify(schema, null, 2)} as const;\n`;
}
writeFileSync('src/contracts/generated.ts', result);
