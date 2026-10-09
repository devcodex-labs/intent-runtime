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
    false,
    "Root should not install optional MCP SDK",
  );
  writeFileSync(
    path.join(temp, "check.mjs"),
    `import assert from 'node:assert/strict';import {Intent} from '@devcodex-labs/intent-runtime';import {createIntentBridge} from '@devcodex-labs/intent-runtime/bridge';
const intent=new Intent({language:'EN-us'});const bridge=createIntentBridge({instances:{test:intent}});const session=bridge.connect();const task=session.prepare({instance:'test',input:'谢谢',fields:[]});assert.equal(task.kind,'task');
const candidate={normalizedInput:'The user expresses thanks; no action requested.',primaryIntent:null,requirements:[],prohibitions:[],intents:[]};
assert.equal(session.accept({jobId:task.jobId,stepToken:task.stepToken,candidateText:JSON.stringify(candidate)}).kind,'result');bridge.close();intent.dispose();
let blocked=false;try{await import('@devcodex-labs/intent-runtime/dist/core/pipeline.js')}catch{blocked=true}assert.ok(blocked);
`,
  );
  run(process.execPath, ["check.mjs"]);
  run(npm, [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "openai@7.30.1",
    "@modelcontextprotocol/sdk@1.32.1",
  ]);
  writeFileSync(
    path.join(temp, "api-check.mjs"),
    `import assert from 'node:assert/strict';import {Intent} from '@devcodex-labs/intent-runtime';import {createApiExecutor} from '@devcodex-labs/intent-runtime/adapters/api';
const candidate={normalizedInput:'No operation requested.',primaryIntent:null,requirements:[],prohibitions:[],intents:[]};
const executor=createApiExecutor({provider:'openai',apiKey:'test',model:'fixture',fetch:async()=>new Response(JSON.stringify({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(candidate)}]}]}),{headers:{'content-type':'application/json'}})});
const intent=new Intent({executor});assert.deepEqual((await intent.parse({input:'谢谢',fields:[]})).intents,[]);intent.dispose();`,
  );
  run(process.execPath, ["api-check.mjs"]);
  const pkg = path.join(temp, "node_modules/@devcodex-labs/intent-runtime");
  const metadata = JSON.parse(
    readFileSync(path.join(pkg, "package.json"), "utf8"),
  );
  for (const entry of Object.values(metadata.exports))
    assert.ok(existsSync(path.join(pkg, entry.types)));
  const main = path.join(pkg, "dist/transports/mcp/main.js");
  writeFileSync(
    path.join(temp, "mcp-check.mjs"),
    `import assert from 'node:assert/strict';import {Client} from '@modelcontextprotocol/sdk/client/index.js';import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const transport=new StdioClientTransport({command:process.execPath,args:[${JSON.stringify(main)},'--config',${JSON.stringify(path.join(pkg, "examples/codex/intent.config.mjs"))}],stderr:'pipe'});
const client=new Client({name:'package-check',version:'1'});try{await client.connect(transport);assert.equal((await client.listTools()).tools.length,3);const r=await client.callTool({name:'intent_prepare',arguments:{instance:'orders',input:'000123',fields:[]}});assert.equal(r.structuredContent.kind,'task');await client.callTool({name:'intent_cancel',arguments:{jobId:r.structuredContent.jobId}});}finally{await client.close();}`,
  );
  run(process.execPath, ["mcp-check.mjs"]);
  console.log(
    "Installed package: root without optional SDKs, bridge, data snapshots, exports/declarations, API adapter and stdio MCP verified.",
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}
