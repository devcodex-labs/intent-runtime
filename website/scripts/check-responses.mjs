import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { documentationFiles, codeBlocks } from "./markdown.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const page = name => readFile(join(root, "website/content", name), "utf8");
const [responsePage, bridgePage, errorPage, contextPage] = await Promise.all([
  page("api/response.md"), page("api/bridge-mcp.md"), page("api/errors.md"), page("examples/context-fields.md"),
]);
const printer = ts.createPrinter({ removeComments: true });
function declarations(source) {
  const file = ts.createSourceFile("reference.ts", source, ts.ScriptTarget.Latest, true);
  return new Map(file.statements.filter(node => ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)).map(node => [node.name.text, { node, text: printer.printNode(ts.EmitHint.Unspecified, node, file).replace(/^export\s+/, "").replace(/\s+/g, " ").trim() }]));
}
const typeBlocks = text => codeBlocks(text).filter(block => block.language === "ts").map(block => block.code).join("\n");
const publicTypes = declarations(await readFile(join(root, "src/contracts/public.ts"), "utf8"));
const bridgeTypes = declarations(await readFile(join(root, "src/bridge/index.ts"), "utf8"));
const errorTypes = declarations(await readFile(join(root, "src/errors.ts"), "utf8"));
const docTypes = declarations(typeBlocks(responsePage + bridgePage + errorPage));
for (const [source, names] of [
  [publicTypes, ["JsonValue", "Clarification", "ItemBase", "IntentItem", "IntentResult"]],
  [bridgeTypes, ["BridgeReply", "PrepareRequest", "AcceptRequest", "CancelRequest", "BridgeSession"]],
  [errorTypes, ["IssueCategory", "IntentIssue", "SerializedIntentError"]],
]) {
  for (const name of names) {
    assert.ok(source.has(name) && docTypes.has(name), `Missing response type: ${name}`);
    assert.equal(docTypes.get(name).text, source.get(name).text, `Response type drift: ${name}`);
  }
}

const { Intent, ACTIONS, STATUSES } = await import(new URL("../../dist/index.js", import.meta.url));
const { serveIntentMcp } = await import(new URL("../../dist/transports/mcp/index.js", import.meta.url));
for (const [name, values] of [["IntentAction", ACTIONS], ["IntentStatus", STATUSES]]) {
  const node = docTypes.get(name)?.node.type;
  assert.ok(node && ts.isUnionTypeNode(node), name);
  assert.deepEqual(node.types.map(type => { assert.ok(ts.isLiteralTypeNode(type) && ts.isStringLiteral(type.literal)); return type.literal.text; }), [...values], `Response enum drift: ${name}`);
}

const examples = new Map();
const exampleKinds = new Set(["response", "bridge-reply", "error-response", "mcp-response", "model-candidate", "business-schema", "parse-request"]);
for (const path of await documentationFiles(root)) {
  for (const block of codeBlocks(await readFile(path, "utf8")).filter(block => block.language === "json")) {
    const value = JSON.parse(block.code);
    if (value && typeof value === "object" && !Array.isArray(value) && Object.hasOwn(value, "input") && Object.hasOwn(value, "normalizedInput") && Object.hasOwn(value, "intents"))
      assert.equal(block.annotation?.kind, "response", `Untracked complete IntentResult in ${path}:${block.line}`);
    if (!block.annotation || !exampleKinds.has(block.annotation.kind)) continue;
    const { kind, name } = block.annotation, key = `${kind}:${name}`;
    assert.ok(!examples.has(key), `Duplicate response example: ${key}`);
    examples.set(key, { kind, value });
  }
}
const get = key => { assert.ok(examples.has(key), `Missing documented response: ${key}`); return examples.get(key).value; };
const expectedKeys = [
  ...["default", "clarification", "confirmation", "conditional", "multiple", "no-intent", "data", "quick-start", "context"].map(name => `response:${name}`),
  ...["intent-contract", "global-requirements", "phases", "compound-conditions", "combined-blockers", "modify", "other", "constraints-only", "data-values", "partial-fields"].map(name => `response:${name}`),
  ...["task", "result", "error"].map(name => `bridge-reply:${name}`),
  "error-response:input", "error-response:data", "mcp-response:result",
  ...["core", "data", "missing-data"].map(name => `model-candidate:${name}`),
  ...["data-values", "partial-fields", "missing-dependency"].map(name => `model-candidate:${name}`),
  ...["data-values", "partial-fields"].map(name => `business-schema:${name}`),
  ...["data-values", "partial-fields", "missing-dependency"].map(name => `parse-request:${name}`),
  "error-response:dependency",
];
assert.deepEqual([...examples.keys()].sort(), expectedKeys.sort(), "Response example coverage drift");

// Typecheck the actual Markdown JSON against the built public declarations,
// including fields forbidden by the IntentItem discriminated union.
const types = { response: "IntentResult", "bridge-reply": "BridgeReply", "error-response": "SerializedIntentError", "mcp-response": "CallToolResult" };
types["business-schema"] = "JSONSchema";
types["parse-request"] = "IntentParseRequest";
const code = [
  'import type { IntentResult, SerializedIntentError, JSONSchema, IntentParseRequest } from "@devcodex/intent-runtime";',
  'import type { BridgeReply } from "@devcodex/intent-runtime/bridge";',
  'import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";',
  ...[...examples.values()].filter(example => types[example.kind]).map((example, index) => `const sample${index} = ${JSON.stringify(example.value)} satisfies ${types[example.kind]};`),
].join("\n");
const virtual = join(root, ".docs-response-examples.ts").replaceAll("\\", "/");
const options = { noEmit: true, strict: true, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, target: ts.ScriptTarget.ES2022, skipLibCheck: true };
const host = ts.createCompilerHost(options);
const exists = host.fileExists.bind(host), read = host.readFile.bind(host), sourceFile = host.getSourceFile.bind(host);
host.fileExists = path => path === virtual || exists(path);
host.readFile = path => path === virtual ? code : read(path);
host.getSourceFile = (path, language, onError, shouldCreate) => path === virtual ? ts.createSourceFile(path, code, language, true) : sourceFile(path, language, onError, shouldCreate);
const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([virtual], options, host));
if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCanonicalFileName: x => x, getCurrentDirectory: () => root, getNewLine: () => "\n" }));

const capability = { nativeJsonSchema: false, nativeJsonObject: false, isolatedTurn: true, supportsAbort: true };
const absent = () => ({ clarificationReason: null, questions: [], confirmationReason: null, conditionReason: null });
function candidate(result) {
  return {
    normalizedInput: result.normalizedInput, primaryIntent: result.primaryIntent, requirements: result.requirements, prohibitions: result.prohibitions,
    intents: result.intents.map(item => ({
      action: item.action, target: item.target, requirements: item.requirements,
      blockers: { ...absent(), ...(item.status === "needs_clarification" ? { clarificationReason: item.reason, questions: item.clarification } : item.status === "awaiting_confirmation" ? { confirmationReason: item.reason } : item.status === "conditional" ? { conditionReason: item.reason } : {}) },
    })),
  };
}
const taskExample = get("bridge-reply:task"), payload = JSON.parse(taskExample.payload), schema = payload.schemaReference;
const dataCandidate = get("model-candidate:data");
async function parse(request, candidates, businessSchema, overrides = {}) {
  let index = 0;
  const intent = new Intent({ language: "zh-CN", ...(businessSchema ? { schema: businessSchema } : {}), ...overrides, executor: { id: "docs:responses", capabilities: capability, async generate() { assert.ok(index < candidates.length, "Unexpected candidate repair"); return { outcome: "complete", text: JSON.stringify(candidates[index++]) }; } } });
  try { return { result: await intent.parse(request) }; }
  catch (error) {
    if (typeof error.toJSON !== "function") throw error;
    return { error: JSON.parse(JSON.stringify(error.toJSON())) };
  }
  finally { intent.dispose(); assert.equal(index, candidates.length, "Unconsumed documented candidates"); }
}
const businessCases = new Map(["data-values", "partial-fields"].map(name => [`response:${name}`, { schema: get(`business-schema:${name}`), request: get(`parse-request:${name}`), extension: get(`model-candidate:${name}`) }]));
for (const [key, example] of examples) {
  if (example.kind !== "response") continue;
  const expected = example.value, hasData = Object.keys(expected.data).length > 0;
  const fixture = businessCases.get(key);
  const request = structuredClone(fixture?.request ?? { input: expected.input, fields: hasData ? ["orderId"] : [] });
  assert.equal(request.input, expected.input, `Documented input drift: ${key}`);
  if (hasData && !fixture) assert.deepEqual(Object.keys(expected.data), ["orderId"], `Missing business fixture for ${key}`);
  const extension = structuredClone(fixture?.extension ?? dataCandidate);
  if (key === "response:context") {
    const contextRequest = codeBlocks(contextPage).filter(block => block.language === "json").map(block => JSON.parse(block.code)).find(value => value.context && value.input === expected.input);
    assert.ok(contextRequest, "Context example must include explicit material");
    request.context = contextRequest.context;
    for (const entry of [...extension.evidence, ...extension.descriptionChecks]) for (const source of entry.sources) source.sourceId = "context:0";
  }
  const coreCandidate = candidate(expected);
  if (key === "response:combined-blockers") {
    const reasons = expected.intents[0].reason.split("\n");
    assert.equal(reasons.length, 3, "Combined-blocker example must preserve all three reasons");
    Object.assign(coreCandidate.intents[0].blockers, { clarificationReason: reasons[0], confirmationReason: reasons[1], conditionReason: reasons[2] });
  }
  assert.deepEqual(await parse(request, [coreCandidate, ...(hasData ? [extension] : [])], fixture?.schema ?? (hasData ? schema : undefined)), { result: expected }, key);
}

// Assert the documented content, not just example names and valid types.
const results = [...examples.values()].filter(example => example.kind === "response").map(example => example.value);
assert.deepEqual([...new Set(results.flatMap(result => result.intents.map(item => item.action)).filter(Boolean))].sort(), [...ACTIONS].sort(), "All action categories need a complete response");
assert.deepEqual([...new Set(results.flatMap(result => result.intents.map(item => item.status)))].sort(), [...STATUSES].sort(), "All understanding statuses need a complete response");
const globalRequirements = get("response:global-requirements");
assert.ok(globalRequirements.requirements.length && globalRequirements.prohibitions.length && globalRequirements.intents.some(item => item.requirements.length), "Global/local requirements and prohibitions need a combined example");
assert.ok(globalRequirements.requirements.includes("总预算不超过100元"), "Keep the input's total budget");
const phases = get("response:phases");
assert.deepEqual(phases.intents.map(item => item.action), ["analyze", "modify"]);
assert.equal(phases.requirements.filter(text => text.includes("预算")).length, 1);
assert.ok(phases.requirements.includes("总预算不超过100元") && phases.requirements.includes("今天18:00前完成"));
assert.ok(phases.intents.every(item => !item.requirements.some(text => text.includes("预算"))));
assert.ok(phases.intents[0].requirements.includes("分析阶段不修改代码") && !phases.prohibitions.some(text => text.includes("不修改代码")), "Phase restriction must remain local");
assert.ok(phases.intents[1].requirements.includes("分析完成且测试环境就绪后"));
const constraints = get("response:constraints-only");
assert.equal(constraints.intents.length, 0);
assert.equal(constraints.primaryIntent, null);
assert.ok(constraints.requirements.length && constraints.prohibitions.length, "Pure constraints must not invent an action");
const compound = get("response:compound-conditions");
assert.ok(compound.intents[0].requirements.includes("仅在（测试通过且负责人确认）或预发布验证通过后"));
assert.ok(compound.intents[1].requirements.includes("可选，不是必做项"));
assert.ok(get("response:combined-blockers").intents[0].clarification.some(question => question.options.length > 0));
const values = get("response:data-values").data;
assert.equal(values.urgent, false); assert.equal(values.budget, 0); assert.equal(values.note, null);
assert.deepEqual(values.tags, []); assert.deepEqual(values.metadata, {});
assert.deepEqual(values.orders, [{ orderId: "000123", quantity: 2 }, { orderId: "000124", quantity: 1 }]);
assert.ok(!Object.hasOwn(values, "deliveryNote"));
assert.ok(get("model-candidate:data-values").fieldResults.some(field => field.path === "/data/deliveryNote" && field.status === "not_provided"));
assert.equal(get("business-schema:data-values").properties.deliveryNote.default, "默认配送说明");
const partialFixture = businessCases.get("response:partial-fields");
assert.ok(partialFixture.schema.description);
assert.deepEqual(partialFixture.request.fields, ["endTime"]);
assert.deepEqual(get("response:partial-fields").data, { endTime: "10:00" });
const noRootCheck = structuredClone(partialFixture.extension); noRootCheck.descriptionChecks = [];
const missingRoot = await parse(partialFixture.request, [candidate(get("response:partial-fields")), noRootCheck], partialFixture.schema, { repairAttempts: 0 });
assert.equal(missingRoot.error.code, "MODEL_OUTPUT_INVALID", "Partial fields must retain the root description check");
assert.equal(missingRoot.error.stage, "data");
const dependency = get("error-response:dependency");
assert.deepEqual(await parse(get("parse-request:missing-dependency"), [candidate(dependency.partialResult), get("model-candidate:missing-dependency")], partialFixture.schema), { error: dependency });
assert.ok(dependency.issues.some(issue => issue.code === "DATA_DEPENDENCY_MISSING"));
assert.ok(dependency.issues.some(issue => issue.code === "DATA_DESCRIPTION_UNDETERMINED"));
assert.deepEqual(dependency.partialResult.data, {});
assert.deepEqual(candidate(get("response:data")), get("model-candidate:core"));
const inputError = new Intent();
try { await assert.rejects(inputError.parse({ input: " " }), error => { assert.deepEqual(error.toJSON(), get("error-response:input")); return true; }); }
finally { inputError.dispose(); }
const partial = get("error-response:data");
assert.deepEqual(await parse({ input: partial.partialResult.input }, [candidate(partial.partialResult), get("model-candidate:missing-data")], schema), { error: partial });

// More than one blocker must preserve all reasons with the documented priority.
const blocked = candidate(get("response:clarification"));
blocked.intents[0].blockers.confirmationReason = "等待用户确认";
blocked.intents[0].blockers.conditionReason = "等待测试通过";
const { result: combined } = await parse({ input: "信息不明确；用户确认且测试通过后处理", fields: [] }, [blocked]);
assert.equal(combined.intents[0].status, "needs_clarification");
assert.equal(combined.intents[0].reason, `${blocked.intents[0].blockers.clarificationReason}\n等待用户确认\n等待测试通过`);
const waiting = candidate(get("response:confirmation"));
waiting.intents[0].blockers.conditionReason = "等待测试通过";
const { result: confirmed } = await parse({ input: "用户确认且测试通过后删除日志", fields: [] }, [waiting]);
assert.equal(confirmed.intents[0].status, "awaiting_confirmation");
assert.equal(confirmed.intents[0].reason, `${waiting.intents[0].blockers.confirmationReason}\n等待测试通过`);

const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
const intent = new Intent({ language: "zh-CN", schema });
const service = await serveIntentMcp({ instances: { orders: intent }, transport: serverTransport });
const client = new Client({ name: "documentation-responses", version: "1.0.0" });
async function call(name, args) {
  const response = await client.callTool({ name, arguments: args });
  assert.deepEqual(JSON.parse(response.content[0].text), response.structuredContent, "MCP text/object drift");
  assert.equal(response.isError, response.structuredContent.kind === "error");
  return response;
}
const accept = task => ({ jobId: task.jobId, stepToken: task.stepToken });
try {
  await client.connect(clientTransport);
  const initial = (await call("intent_prepare", { instance: "orders", input: payload.currentInput })).structuredContent;
  assert.equal(initial.kind, "task");
  assert.equal(initial.format.kind, "json_schema");
  const conflict = await call("intent_accept", { jobId: initial.jobId, stepToken: "forged", candidateText: "{}" });
  assert.equal(conflict.isError, true);
  assert.equal(conflict.structuredContent.error.code, "BRIDGE_STEP_CONFLICT");
  const repaired = (await call("intent_accept", { ...accept(initial), candidateText: "{" })).structuredContent;
  assert.equal(repaired.stage, "core");
  assert.equal(JSON.parse(repaired.payload).repair.candidate, "{");
  const dataTask = (await call("intent_accept", { ...accept(repaired), candidateText: JSON.stringify(get("model-candidate:core")) })).structuredContent;
  assert.deepEqual({ ...dataTask, jobId: taskExample.jobId, stepToken: taskExample.stepToken, instructions: taskExample.instructions, payload: taskExample.payload }, taskExample);
  assert.deepEqual(JSON.parse(dataTask.payload), payload, "Documented data payload drift");
  const result = (await call("intent_accept", { ...accept(dataTask), candidateText: JSON.stringify(dataCandidate) })).structuredContent;
  assert.deepEqual(result, get("bridge-reply:result"));
  assert.deepEqual((await call("intent_prepare", { instance: "orders", input: " " })).structuredContent, get("bridge-reply:error"));
  const expected = get("mcp-response:result");
  const noIntent = (await call("intent_prepare", { instance: "orders", input: expected.structuredContent.result.input, fields: [] })).structuredContent;
  assert.deepEqual(await call("intent_accept", { ...accept(noIntent), candidateText: JSON.stringify(candidate(expected.structuredContent.result)) }), expected);
} finally { await client.close(); await service.close(); intent.dispose(); }

console.log(`Response contracts: 13 type definitions and 2 enums match source; ${examples.size} documented JSON examples checked; ${results.length} API results, global/local constraints, all actions/statuses, nullable/nested/omitted data, partial-field root checks, full errors and real SDK task/repair/result/error envelopes verified with controlled candidates.`);
