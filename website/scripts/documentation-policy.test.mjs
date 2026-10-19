import test from 'node:test';
import assert from 'node:assert/strict';
import {checkDocumentationPolicy} from './documentation-policy.mjs';

const file = '/content/en/guide/quick-start.mdx';
test('current package installation and public exports remain valid', () => {
  checkDocumentationPolicy(file, 'npm install @devcodex/intent-runtime\n```js\nimport {Intent, IntentError} from "@devcodex/intent-runtime";\n```');
  checkDocumentationPolicy(file, 'npm install -g @devcodex/intent-runtime');
});
test('user pages reject internal material and obsolete API instructions', () => {
  for (const text of ['开发预览', 'TDR-01', 'Usage Contract v0.7', 'PrototypeCoverageError', 'Intent.bridge', '/api/bridge-mcp', 'setup codex']) assert.throws(() => checkDocumentationPolicy(file, text), /Obsolete or internal/);
});
test('default installation does not acquire version pins or extra schema packages', () => {
  for (const command of ['npm install @devcodex/intent-runtime@2.0.0', 'npm install -g @devcodex/intent-runtime@2.0.0', 'npm install @devcodex/intent-runtime schema-dsl']) assert.throws(() => checkDocumentationPolicy(file, command), /Default installation/);
});
test('unsupported exports cannot be presented as current executable examples', () => {
  for (const code of ['import {IntentParseError} from "@devcodex/intent-runtime";', 'import {createIntentBridge} from "@devcodex/intent-runtime/bridge";']) assert.throws(() => checkDocumentationPolicy(file, '```js\n' + code + '\n```'), /Unsupported export/);
});
