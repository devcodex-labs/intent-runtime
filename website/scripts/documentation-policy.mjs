import assert from 'node:assert/strict';

// Every user-facing page follows the same current-version rules.
export function checkDocumentationPolicy(file, text) {
  assert(!/开发预览|Intent\.bridge|coreJson|dataJson|setup codex|\/api\/bridge-mcp|TDR-\d|TAF-\d|DEV-\d|GATE-\d|codex-temp|PrototypeCoverageError|Usage Contract v\d|匹配的新版发布后|确认.{0,15}新版.{0,5}已发布|尚无对应本文接口的新版发行|当前发行状态/.test(text), 'Obsolete or internal documentation: ' + file);
  assert(!/npm install (?:-g )?@devcodex\/intent-runtime(?:@[^\s`]+|[^\n]*\bschema-dsl\b)/.test(text), 'Default installation must use only the unversioned runtime package: ' + file);
  for (const [, code] of text.matchAll(/```(?:ts|js)\n([\s\S]*?)\n```/g)) {
    assert(!/import[^;]*\b(?:IntentParseError|IntentDataError|createIntentBridge)\b|from\s*['"]@devcodex\/intent-runtime\/bridge['"]/.test(code), 'Unsupported export in current documentation: ' + file);
  }
}
