import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const root = process.cwd(),
  temp = mkdtempSync(path.join(tmpdir(), "intent-runtime-package-"));
const npm = "npm";
function run(command, args, cwd = temp) {
  if (command === npm) {
    if (!process.env.npm_execpath)
      throw new Error("Run via npm run smoke:package");
    args = [process.env.npm_execpath, ...args];
    command = process.execPath;
  }
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      npm_config_cache:
        process.env.npm_config_cache ?? path.join(temp, "cache"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}
try {
  const packed = JSON.parse(
    run(npm, ["pack", "--json", "--pack-destination", temp], root),
  );
  const tar = path.join(temp, packed[0].filename);
  writeFileSync(
    path.join(temp, "package.json"),
    JSON.stringify({
      name: "intent-runtime-install-check",
      version: "1.0.0",
      private: true,
      type: "module",
    }),
  );
  run(npm, ["install", "--ignore-scripts", "--no-audit", "--no-fund", tar]);
  assert.equal(
    existsSync(path.join(temp, "node_modules/openai")),
    false,
    "Root should not install optional API SDK",
  );
  assert.equal(
    existsSync(path.join(temp, "node_modules/@modelcontextprotocol/sdk")),
    true,
    "MCP SDK must be available after a single module installation",
  );
  writeFileSync(
    path.join(temp, "check.mjs"),
    `import assert from 'node:assert/strict';import {Intent} from '@devcodex/intent-runtime';import {createIntentBridge} from '@devcodex/intent-runtime/bridge';
const intent=new Intent({language:'EN-us',schema:{type:'object',properties:{value:{type:'string'}}}});const bridge=createIntentBridge({instances:{test:intent}});const session=bridge.connect();const task=session.prepare({instance:'test',input:'hello'});assert.equal(task.kind,'task');
const candidate={normalizedInput:'The user expresses thanks; no action requested.',primaryIntent:null,requirements:[],prohibitions:[],intents:[]};
const next=await session.accept({jobId:task.jobId,stepToken:task.stepToken,candidateText:JSON.stringify(candidate)});assert.equal(next.kind,'task');
const data={data:{value:'hello'},evidence:[{path:'/data/value',mode:'exact',sources:[{sourceId:'input',quote:'hello'}]}],descriptionChecks:[],fieldResults:[{path:'/data/value',status:'extracted',explanation:'Explicit value'}],issues:[]};
assert.equal((await session.accept({jobId:next.jobId,stepToken:next.stepToken,candidateText:JSON.stringify(data)})).kind,'result');bridge.close();intent.dispose();
let blocked=false;try{await import('@devcodex/intent-runtime/dist/core/pipeline.js')}catch{blocked=true}assert.ok(blocked);
`,
  );
  run(process.execPath, ["check.mjs"]);
  run(npm, [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "openai@6.49.0",
  ]);
  writeFileSync(
    path.join(temp, "api-check.mjs"),
    `import assert from 'node:assert/strict';import {Intent} from '@devcodex/intent-runtime';import {createApiExecutor} from '@devcodex/intent-runtime/adapters/api';
const candidate={normalizedInput:'No operation requested.',primaryIntent:null,requirements:[],prohibitions:[],intents:[]};
const executor=createApiExecutor({provider:'openai',apiKey:'test',model:'fixture',fetch:async()=>new Response(JSON.stringify({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(candidate)}]}]}),{headers:{'content-type':'application/json'}})});
const intent=new Intent({executor});assert.deepEqual((await intent.parse({input:'谢谢',fields:[]})).intents,[]);intent.dispose();`,
  );
  run(process.execPath, ["api-check.mjs"]);
  const pkg = path.join(temp, "node_modules/@devcodex/intent-runtime");
  const metadata = JSON.parse(
    readFileSync(path.join(pkg, "package.json"), "utf8"),
  );
  for (const entry of Object.values(metadata.exports))
    assert.ok(existsSync(path.join(pkg, entry.types)));
  writeFileSync(path.join(temp, "contract-check.mts"), `
import {Intent} from '@devcodex/intent-runtime';
import type {IntentParseOptions,IntentResult} from '@devcodex/intent-runtime';
import {createIntentBridge} from '@devcodex/intent-runtime/bridge';
import type {BridgeReply} from '@devcodex/intent-runtime/bridge';
import {createIntentMcpAdapter} from '@devcodex/intent-runtime/mcp/adapter';
import type {IntentMcpAdapter,IntentMcpAdapterConfig,IntentMcpSession,IntentMcpToolDefinition,IntentMcpToolResult} from '@devcodex/intent-runtime/mcp/adapter';
const intent = new Intent();
const options:IntentParseOptions = {signal:new AbortController().signal};
const config:IntentMcpAdapterConfig = {mode:'executor',instances:{general:intent},toolPrefix:'project_'};
const adapter:IntentMcpAdapter = createIntentMcpAdapter(config);
const tools:readonly IntentMcpToolDefinition[] = adapter.tools;
const session:IntentMcpSession = adapter.connect();
const reply:Promise<IntentMcpToolResult|undefined> = session.callTool('project_intent_parse',{instance:'general',input:'x',context:[{role:'user',content:'explicit context'}],fields:[]},options);
const parsed:Promise<IntentResult> = intent.parse({input:'x'},options);
const bridge = createIntentBridge({instances:{general:intent}});
const accepted:Promise<BridgeReply> = bridge.connect().accept({jobId:'x',stepToken:'x',candidateText:'{}'},options);
session.close();adapter.close();bridge.close();intent.dispose();
`);
  run(process.execPath, [path.join(root, "node_modules/typescript/bin/tsc"), "--noEmit", "--strict", "--skipLibCheck", "--target", "ES2022", "--module", "NodeNext", "--moduleResolution", "NodeNext", "contract-check.mts"]);
  // Importing the thin adapter must not pull in a model or MCP Server SDK.
  const loader = path.join(temp, "block-sdk-loader.mjs");
  writeFileSync(loader, `export async function resolve(name,context,next){if(name.startsWith('@modelcontextprotocol/')||name==='openai')throw new Error('Unexpected SDK load: '+name);return next(name,context);}`);
  writeFileSync(path.join(temp, "adapter-check.mjs"), `import assert from 'node:assert/strict';import {Intent} from '@devcodex/intent-runtime';import {createIntentMcpAdapter} from '@devcodex/intent-runtime/mcp/adapter';
const intent=new Intent();const adapter=createIntentMcpAdapter({instances:{default:intent}});assert.equal(adapter.tools.length,3);adapter.close();intent.dispose();`);
  run(process.execPath, ["--experimental-loader", loader, "adapter-check.mjs"]);
  const examples = [
    ["api/parse.mjs", "--fixture"],
    ["api/parse.mjs", "--fixture", "--no-data"],
    ["api/custom-executor.mjs", "--fixture"],
    ["bridge/recognize.mjs", "--fixture"],
    ["mcp/executor/client.mjs", "--fixture"],
    ["mcp/host/client.mjs", "--fixture", "--repair"],
    ["mcp/stdio/client.mjs", "--fixture"],
  ];
  for (const [file, ...args] of examples) {
    assert.ok(existsSync(path.join(pkg, "examples", file)), "Missing packaged example: " + file);
    const value = JSON.parse(run(process.execPath, [path.join(pkg, "examples", file), ...args]));
    const result = value.kind === "result" ? value.result : value;
    assert.equal(result.intents[0].action, "query", file);
    assert.deepEqual(result.requirements, ["Return the result in Chinese."], file);
    assert.deepEqual(result.intents[0].requirements, ["Include the order status."], file);
    assert.deepEqual(result.prohibitions, ["Do not modify or cancel the order."], file);
    assert.deepEqual(result.data, args.includes("--no-data") ? {} : { orderId: "000123" }, file);
  }
  const main = path.join(pkg, "dist/transports/mcp/main.js");
  writeFileSync(
    path.join(temp, "mcp-check.mjs"),
    `import assert from 'node:assert/strict';import {Client} from '@modelcontextprotocol/sdk/client/index.js';import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const transport=new StdioClientTransport({command:process.execPath,args:[${JSON.stringify(main)},'--config',${JSON.stringify(path.join(pkg, "examples/codex/intent.config.mjs"))}],stderr:'pipe'});
const client=new Client({name:'package-check',version:'1'});try{await client.connect(transport);assert.equal((await client.listTools()).tools.length,3);const r=await client.callTool({name:'intent_prepare',arguments:{instance:'orders',input:'000123',fields:[]}});assert.equal(r.structuredContent.kind,'task');await client.callTool({name:'intent_cancel',arguments:{jobId:r.structuredContent.jobId}});}finally{await client.close();}`,
  );
  run(process.execPath, ["mcp-check.mjs"]);
  console.log(
    "Installed package: core/bridge/isolated adapter, consumer declaration typecheck, optional API, seven complete controlled example runs and production stdio MCP verified. No real model or Codex client was executed.",
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}
