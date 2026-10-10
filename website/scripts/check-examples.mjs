import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
const content = join(root, "website/content");
async function walk(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "public") continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await walk(p));
    else if (/\.md$/.test(p)) result.push(p);
  }
  return result;
}
const samples = new Map();
for (const path of await walk(content)) {
  const source = await readFile(path, "utf8");
  for (const [,code] of source.matchAll(/```js\n([\s\S]*?)\n```/g))
    samples.set(join(root, `.docs-example-${samples.size}.mjs`), code);
}
const options = { noEmit: true, allowJs: true, checkJs: true, strictNullChecks: true, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, target: ts.ScriptTarget.ES2022, skipLibCheck: true };
const host = ts.createCompilerHost(options);
const read = host.readFile.bind(host), exists = host.fileExists.bind(host), sourceFile = host.getSourceFile.bind(host);
host.fileExists = path => samples.has(path) || exists(path);
host.readFile = path => samples.get(path) ?? read(path);
host.getSourceFile = (path, language, onError, shouldCreate) => samples.has(path)
  ? ts.createSourceFile(path, samples.get(path), language, true, ts.ScriptKind.JS)
  : sourceFile(path, language, onError, shouldCreate);
const program = ts.createProgram([...samples.keys()], options, host);
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCanonicalFileName: x => x, getCurrentDirectory: () => root, getNewLine: () => "\n" }));

const core = (target, action = "query", prohibitions = []) => ({ normalizedInput: target, primaryIntent: target, requirements: [], prohibitions, intents: [{ action, target, requirements: [], blockers: { clarificationReason: null, questions: [], confirmationReason: null, conditionReason: null } }] });
const data = { data: { orderId: "000123" }, evidence: [{ path: "/data/orderId", mode: "exact", sources: [{ sourceId: "input", quote: "000123" }] }], descriptionChecks: [{ path: "/data/orderId", verdict: "satisfied", explanation: "测试原文包含精确编号", sources: [{ sourceId: "input", quote: "000123" }] }], fieldResults: [{ path: "/data/orderId", status: "extracted", explanation: "原文编号" }], issues: [] };
for (const [name,replies,expected] of [
  ["guide/quick-start.md", [core("分析登录失败原因", "analyze", ["先不要修改代码"])], /normalizedInput/],
  ["integrations/openai-xai.md", [core("给出方案并等待确认", "generate")], /normalizedInput/],
  ["examples/orders.md", [core("查询订单 000123"),data], /^000123\s*$/],
]) {
  const source = await readFile(join(content, name), "utf8");
  const code = /```js\n([\s\S]*?)\n```/.exec(source)?.[1];
  assert.ok(code, name);
  const fixture = `const docReplies = ${JSON.stringify(replies)};
globalThis.fetch = async () => {
  if (!docReplies.length) throw new Error('Unexpected additional model request');
  return new Response(JSON.stringify({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(docReplies.shift())}]}]}),{headers:{'content-type':'application/json'}});
};\n`;
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", `${fixture}${code}\nif(docReplies.length) throw new Error('Example did not consume its expected stages');`], { cwd: root, env: { ...process.env, INTENT_PROVIDER: "openai", INTENT_MODEL: "fixture-model", INTENT_OPENAI_KEY: "documentation-fixture", INTENT_XAI_KEY: "documentation-fixture" }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  assert.equal(result.status, 0, `${name}: ${result.stderr}`);
  assert.equal(result.stderr, "", name);
  assert.match(result.stdout, expected, name);
}
console.log(`${samples.size} JavaScript snippets typechecked against public exports; 3 documented API examples executed with actual SDK and controlled fetch. No provider API calls or semantic accuracy measurement.`);
