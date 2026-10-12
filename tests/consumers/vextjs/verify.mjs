import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { McpServer, fromJsonSchema } from "@modelcontextprotocol/server";
import { createIntentMcpAdapter } from "@devcodex/intent-runtime/mcp/adapter";
import { createInstances, disposeInstances, sampleInput } from "./shared/instances.mjs";
import { createExampleExecutor, generateCandidate } from "./shared/candidate-driver.mjs";
import { registerIntentTools } from "./registration.mjs";
import { verifySource } from "./source-identity.mjs";

const sourceRoot = process.env.VEXTJS_SOURCE_ROOT;
const factoryFile = process.env.VEXTJS_FACTORY_MODULE;
if (!sourceRoot || !factoryFile) throw new Error("Provide the fixed VEXTJS_SOURCE_ROOT and its bundled VEXTJS_FACTORY_MODULE.");
const sourceIdentity = await verifySource(sourceRoot);
const sourcePackage = JSON.parse(await readFile(sourceRoot + "/package.json", "utf8"));
assert.equal(sourcePackage.name, "vextjs"); assert.equal(sourcePackage.version, "2.0.0");
assert.equal(sourcePackage.dependencies["@modelcontextprotocol/server"], "2.0.0");
assert.equal(sourcePackage.devDependencies["@modelcontextprotocol/client"], "2.3.1");
const { createVextMcpServer } = await import(pathToFileURL(factoryFile).href);
assert.equal(typeof createVextMcpServer, "function");
const checks = [];
const parseReply = result => result.structuredContent ?? JSON.parse(result.content.find(item => item.type === "text").text);

for (const mode of ["host", "executor"]) {
  const server = createVextMcpServer({ rootDir: sourceRoot, version: sourcePackage.version });
  const originalClose = server.server.onclose;
  let closeCalls = 0;
  server.server.onclose = () => { closeCalls++; originalClose?.call(server.server); };
  const client = new Client({ name: "intent-runtime-vextjs-source-consumer", version: "1.0.0" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  let entered, cancelled;
  const started = new Promise(resolve => { entered = resolve; });
  const aborted = new Promise(resolve => { cancelled = resolve; });
  const driver = createExampleExecutor(true);
  const executor = { ...driver, async generate(request) {
    if (JSON.parse(request.payload).currentInput !== "wait-for-cancellation") return driver.generate(request);
    entered();
    return new Promise((_resolve, reject) => request.signal.addEventListener("abort", () => {
      cancelled(); reject(request.signal.reason);
    }, { once: true }));
  } };
  const instances = createInstances(mode === "executor" ? executor : undefined);
  const adapter = createIntentMcpAdapter({ mode, instances });
  try {
    await server.connect(st); await client.connect(ct);
    const before = {
      tools: (await client.listTools()).tools.map(tool => tool.name),
      resources: (await client.listResources()).resources.map(resource => resource.uri),
      prompts: (await client.listPrompts()).prompts.map(prompt => prompt.name),
    };
    assert.equal(before.tools.length, 7); assert.equal(before.resources.length, 11); assert.equal(before.prompts.length, 4);
    registerIntentTools(server, adapter, before.tools);
    assert.deepEqual((await client.listTools()).tools.map(tool => tool.name).sort(), [...before.tools, ...adapter.tools.map(tool => tool.name)].sort());
    assert.deepEqual((await client.listResources()).resources.map(resource => resource.uri), before.resources);
    assert.deepEqual((await client.listPrompts()).prompts.map(prompt => prompt.name), before.prompts);
    const original = parseReply(await client.callTool({ name: "vext_knowledge_search", arguments: { query: "routing" } }));
    assert.equal(original.status, "ok");
    assert.ok((await client.readResource({ uri: "vext://catalog/capabilities" })).contents.length);
    assert.ok((await client.getPrompt({ name: "diagnose-vext-project", arguments: { symptom: "Read-only integration verification." } })).messages.length);
    let result;
    if (mode === "executor") {
      result = parseReply(await client.callTool({ name: "intent_parse", arguments: { instance: "orders", input: sampleInput } }));
    } else {
      let reply = parseReply(await client.callTool({ name: "intent_prepare", arguments: { instance: "orders", input: sampleInput } }));
      const driver = createExampleExecutor(true);
      while (reply.kind === "task") {
        const candidate = await generateCandidate(driver, reply);
        reply = parseReply(await client.callTool({ name: "intent_accept", arguments: { jobId: reply.jobId, stepToken: reply.stepToken, candidateText: candidate.text } }));
      }
      assert.equal(reply.kind, "result"); result = reply.result;
    }
    assert.equal(result.input, sampleInput); assert.equal(result.data.orderId, "000123");
    assert.deepEqual(result.requirements, ["Return the result in Chinese."]);
    assert.deepEqual(result.intents[0].requirements, ["Include the order status."]);
    const error = await client.callTool({ name: mode === "executor" ? "intent_parse" : "intent_prepare", arguments: { instance: "orders", input: sampleInput, fields: ["missing"] } });
    assert.equal(error.isError, true); assert.equal(error.structuredContent, undefined);
    const failed = parseReply(error); assert.equal((failed.error ?? failed).code, "UNKNOWN_FIELD");
    if (mode === "executor") {
      const controller = new AbortController();
      const pending = client.callTool({name:"intent_parse",arguments:{instance:"orders",input:"wait-for-cancellation",fields:[]}}, {signal:controller.signal});
      const rejected = assert.rejects(pending);
      await started; controller.abort(); await rejected; await aborted;
      assert.equal(parseReply(await client.callTool({name:"intent_parse",arguments:{instance:"orders",input:sampleInput}})).data.orderId,"000123");
    }
    const conflict = createIntentMcpAdapter({ mode, instances, toolPrefix: "vext_" });
    try { assert.throws(() => registerIntentTools(server, conflict, [conflict.tools[0].name]), /conflict/); }
    finally { conflict.close(); }
    checks.push({ mode, originalTools: before.tools.length, originalResources: before.resources.length, originalPrompts: before.prompts.length, finalOrderId: result.data.orderId,
      ...(mode === "executor" ? { clientCancellation: "SDK2 request forwarded; shared instance reusable" } : {}),
    });
  } finally { await client.close(); await server.close(); adapter.close(); disposeInstances(instances); }
  assert.equal(closeCalls, 1, "Original SDK2 server close hook must remain active");
}

// Actual SDK2 outputSchema handling, separately from the Vext factory's tools.
const server = new McpServer({ name: "sdk2-output-schema-check", version: "1.0.0" });
const instances = createInstances(createExampleExecutor(true));
const adapter = createIntentMcpAdapter({ mode: "executor", instances });
const session = adapter.connect();
server.registerTool("intent_parse", { inputSchema: fromJsonSchema(adapter.tools[0].inputSchema), outputSchema: fromJsonSchema({ type: "object", required: ["input"], properties: { input: { type: "string" } } }) }, async (args, ctx) => ({ ...await session.callTool("intent_parse", args, { signal: ctx.mcpReq.signal }) }));
const client = new Client({ name: "sdk2-output-schema-client", version: "1.0.0" });
const [ct, st] = InMemoryTransport.createLinkedPair();
try {
  await server.connect(st); await client.connect(ct); await client.listTools();
  assert.equal(parseReply(await client.callTool({ name: "intent_parse", arguments: { instance: "orders", input: sampleInput } })).data.orderId, "000123");
  const failed = await client.callTool({ name: "intent_parse", arguments: { instance: "orders", input: sampleInput, fields: ["missing"] } });
  assert.equal(failed.isError, true); assert.equal(failed.structuredContent, undefined); assert.equal(parseReply(failed).code, "UNKNOWN_FIELD");
} finally { await client.close(); await server.close(); adapter.close(); disposeInstances(instances); }

console.log(JSON.stringify({
  sourceConsumer: "actual createVextMcpServer, development source fixture; no published Vext MCP export is claimed",
  sourceIdentity,
  sourceServerSha256: createHash("sha256").update(await readFile(sourceRoot + "/src/mcp/server.ts")).digest("hex"),
  vextjs: sourcePackage.version, sdkServer: "2.0.0", sdkClient: "2.3.1", checks,
  outputSchema: "SDK2 success and error-text verified", providerApiCalls: 0,
}, null, 2));
