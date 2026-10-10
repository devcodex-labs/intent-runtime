import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import ts from "typescript";
import { documentationFiles, codeBlocks } from "./markdown.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const content = join(root, "website/content");
const samples = new Map();
for (const path of await documentationFiles(root)) {
  const source = await readFile(path, "utf8");
  for (const block of codeBlocks(source).filter(block => block.language === "js"))
    samples.set(join(root, `.docs-example-${samples.size}.mjs`).replaceAll("\\", "/"), block.code);
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
  ["README.md", [core("Query order 000123"),data], /orderId:\s*'000123'/],
  ["guide/quick-start.md", [core("分析登录失败原因", "analyze", ["先不要修改代码"])], /normalizedInput/],
  ["integrations/openai-xai.md", [core("给出方案并等待确认", "generate")], /normalizedInput/],
  ["examples/orders.md", [core("查询订单 000123"),data], /^000123\s*$/],
]) {
  const source = await readFile(name === "README.md" ? join(root, name) : join(content, name), "utf8");
  const code = codeBlocks(source).find(block => block.language === "js")?.code;
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

const readmeCode = codeBlocks(await readFile(join(root, "README.md"), "utf8")).find(block => block.language === "js").code;
const missingEnv = { ...process.env };
delete missingEnv.INTENT_OPENAI_KEY;
delete missingEnv.INTENT_MODEL;
const readmeMissing = spawnSync(process.execPath, ["--input-type=module", "--eval", `globalThis.fetch = () => { throw new Error('Unexpected provider request'); };\n${readmeCode}`], { cwd: root, env: missingEnv, encoding: "utf8" });
assert.notEqual(readmeMissing.status, 0);
assert.match(readmeMissing.stderr, /Set INTENT_OPENAI_KEY and INTENT_MODEL/);

const bridgePage = await readFile(join(content, "api/bridge-mcp.md"), "utf8");
const bridgeBlocks = codeBlocks(bridgePage).filter(block => block.language === "js");
const bridgeCode = bridgeBlocks[0]?.code;
assert.ok(bridgeCode, "Complete Bridge example");
const bridgeRun = spawnSync(process.execPath, ["--input-type=module", "--eval", `${bridgeCode}\n
import assert from 'node:assert/strict';
let calls = 0;
const reply = await recognizeWithHost('查询订单 000123', async task => {
  assert.equal(task.kind, 'task');
  return ++calls === 1 ? '{' : JSON.stringify(${JSON.stringify(core("查询订单 000123"))});
});
assert.equal(calls, 2);
assert.equal(reply.kind, 'result');
assert.deepEqual(reply.result.data, {});
const failure = await recognizeWithHost('查询订单 000123', async () => '{}');
assert.equal(failure.kind, 'error');
assert.equal(failure.error.code, 'MODEL_OUTPUT_INVALID');
console.log('Complete Bridge example: repair, result and terminal error verified');
`], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
assert.equal(bridgeRun.status, 0, bridgeRun.stderr);
assert.equal(bridgeRun.stderr, "");

const recoveryCode = bridgeBlocks.find(block => block.code.includes("export async function resubmitAfterSizeRejection"))?.code;
assert.ok(recoveryCode, "Documented capacity-rejection continuation");
const recoveryRun = spawnSync(process.execPath, ["--input-type=module", "--eval", `
import assert from 'node:assert/strict';
import { Intent } from '@devcodex/intent-runtime';
import { createIntentBridge } from '@devcodex/intent-runtime/bridge';
${recoveryCode}
const intent = new Intent({limits:{maxOutputBytes:2048}});
const bridge = createIntentBridge({instances:{default:intent}});
try {
  const session = bridge.connect(), task = session.prepare({instance:'default',input:'000123',fields:[]});
  assert.equal(task.kind,'task');
  const rejected = await session.accept({jobId:task.jobId,stepToken:task.stepToken,candidateText:'x'.repeat(2049)});
  assert.equal(rejected.error.code,'LIMIT_EXCEEDED');
  const result = await resubmitAfterSizeRejection(session,task,JSON.stringify(${JSON.stringify(core("000123"))}));
  assert.equal(result.kind,'result');
} finally {bridge.close();intent.dispose();}
`], { cwd: root, encoding: "utf8" });
assert.equal(recoveryRun.status, 0, recoveryRun.stderr);

// These are public boundaries explained by the documentation, checked against
// the built package. Controlled candidates never call a model provider.
const { Intent } = await import(new URL("../../dist/index.js", import.meta.url));
const { createIntentBridge } = await import(new URL("../../dist/bridge/index.js", import.meta.url));
const { MCP_TOOLS } = await import(new URL("../../dist/transports/mcp/index.js", import.meta.url));
const { createApiExecutor } = await import(new URL("../../dist/adapters/api/index.js", import.meta.url));
for (const [language, expected] of [["en-us", "en-US"], ["zh-CN", "zh-CN"], ["i-klingon", "tlh"], ["zh-cmn", "cmn"]]) {
  const languageIntent = new Intent({ language });
  const languageBridge = createIntentBridge({ instances: { default: languageIntent } });
  try {
    const task = languageBridge.connect().prepare({ instance: "default", input: "x", fields: [] });
    assert.equal(task.kind, "task");
    assert.equal(JSON.parse(task.payload).structuredLanguage, expected);
  } finally { languageBridge.close(); languageIntent.dispose(); }
}
for (const language of ["und", "mul", "zxx", "i-default", "x-private", "qaa", "en_US", " en"])
  assert.throws(() => new Intent({ language }), error => error.code === "CONFIG_INVALID");
const capability = { nativeJsonSchema: false, nativeJsonObject: false, isolatedTurn: true, supportsAbort: true };
const reply = value => ({ outcome: "complete", text: JSON.stringify(value) });
const schema = { type: "object", properties: { orderId: { type: "string", description: "Current order identifier; preserve exactly.", default: "000123" } }, required: ["orderId"] };
const providerPage = await readFile(join(content, "integrations/openai-xai.md"), "utf8");
for (const provider of ["openai", "xai"]) {
  const requests = [], candidates = [core("000123"), data];
  const api = new Intent({ schema, executor: createApiExecutor({ provider, apiKey: "documentation-fixture", model: "fixture-model", async fetch(_url, init) {
    requests.push(JSON.parse(init.body));
    assert.ok(candidates.length, "Unexpected API stage");
    return new Response(JSON.stringify({status:"completed",output:[{type:"message",role:"assistant",content:[{type:"output_text",text:JSON.stringify(candidates.shift())}]}]}), {headers:{"content-type":"application/json"}});
  } }) });
  try {
    assert.deepEqual((await api.parse({input:"000123"})).data,{orderId:"000123"});
    const row = providerPage.split("\n").find(line => line.startsWith(`| ${provider === "openai" ? "OpenAI" : "xAI"} |`));
    assert.ok(row, `Missing provider format row: ${provider}`);
    const documented = [...row.matchAll(/type: "([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(requests.map(request => request.text.format.type), documented, `Documented SDK format drift: ${provider}`);
    assert.equal(requests[0].text.format.strict,true);
    assert.match(row,/strict: true/);
    assert.equal(candidates.length,0);
  } finally {api.dispose();}
}
const missing = { data: {}, evidence: [], descriptionChecks: [], fieldResults: [{ path: "/data/orderId", status: "issue", explanation: "No order given." }], issues: [{ code: "DATA_REQUIRED_MISSING", category: "business_information", path: "/data/orderId", message: "No order given." }] };
let calls = 0;
const missingIntent = new Intent({ schema, executor: { id: "docs:missing", capabilities: capability, async generate() { return reply(++calls === 1 ? core("查询订单") : missing); } } });
try {
  await assert.rejects(missingIntent.parse({ input: "查询订单" }), error => error.code === "DATA_EXTRACTION_FAILED" && error.issues[0].code === "DATA_REQUIRED_MISSING" && Object.keys(error.partialResult.data).length === 0);
  assert.equal(calls, 2, "Business missing must not generate a repair or insert default values");
} finally { missingIntent.dispose(); }

calls = 0;
const wrongSource = { ...data, evidence: [{ ...data.evidence[0], sources: [{ sourceId: "input", quote: "999" }] }] };
const sourceIntent = new Intent({ schema, executor: { id: "docs:source", capabilities: capability, async generate() { return reply(++calls === 1 ? core("查询订单 000123") : wrongSource); } } });
try {
  await assert.rejects(sourceIntent.parse({ input: "查询订单 000123" }), error => error.code === "MODEL_OUTPUT_INVALID" && error.stage === "data");
  assert.equal(calls, 3, "Source quote errors must receive one candidate repair");
} finally { sourceIntent.dispose(); }

const active = new Intent({ executor: { id: "docs:dispose", capabilities: capability, generate: () => new Promise(() => {}) } });
const disposed = assert.rejects(active.parse({ input: "x", fields: [] }), error => error.code === "INSTANCE_DISPOSED");
active.dispose();
await disposed;

const original = { id: "docs:reference", capabilities: capability, async generate() { return reply(core("original")); } };
const config = { executor: original };
const referenced = new Intent(config);
try {
  config.executor = { ...original, async generate() { return reply(core("replacement")); } };
  original.generate = async () => reply(core("mutated original"));
  assert.equal((await referenced.parse({ input: "x", fields: [] })).intents[0].target, "mutated original");
} finally { referenced.dispose(); }

const intent = new Intent();
const bridge = createIntentBridge({ instances: { default: intent } });
try {
  const session = bridge.connect();
  const job = session.prepare({ instance: "default", input: "x", fields: [] });
  assert.equal(job.kind, "task");
  assert.equal(session.cancel({ jobId: job.jobId, detail: "中".repeat(683) }).error.code, "INPUT_INVALID");
  const terminal = await session.accept({ jobId: job.jobId, stepToken: job.stepToken, candidateText: JSON.stringify(core("x")) });
  assert.equal(terminal.kind, "result");
  assert.deepEqual(session.cancel({ jobId: job.jobId }), terminal);
  const next = session.prepare({ instance: "default", input: "x", fields: [] });
  assert.equal(session.cancel({ jobId: next.jobId, detail: "中".repeat(682) }).error.code, "MODEL_ABORTED");
  assert.match(MCP_TOOLS.find(tool => tool.name === "intent_cancel").inputSchema.properties.detail.description, /2048 UTF-8 bytes/);
} finally { bridge.close(); intent.dispose(); }

await import("./check-responses.mjs");
console.log(`${samples.size} JavaScript snippets, including README, typechecked against public exports; 4 documented API examples executed with actual SDK and controlled fetch; README missing-environment guard, provider wire-format table, Bridge repair/continuation and 6 public behavior groups verified. No provider API calls or semantic accuracy measurement.`);
