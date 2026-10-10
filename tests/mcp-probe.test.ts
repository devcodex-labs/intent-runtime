import { afterEach, expect, it } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { probeMcp } from "../src/transports/mcp/probe.js";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function server(startupMs: number, listMs = 0) {
  const root = await mkdtemp(join(tmpdir(), "intent-probe-"));
  roots.push(root);
  const file = join(root, "server.mjs");
  await writeFile(file, `import {createInterface} from "node:readline";
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
await pause(${startupMs});
createInterface({input:process.stdin}).on("line",async line=>{
  const request=JSON.parse(line); if(request.id===undefined)return;
  let result;
  if(request.method==="initialize") result={protocolVersion:request.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:"diagnostic-fixture",version:"1"},instructions:'Configured instances: ["default"]\\n'};
  else if(request.method==="tools/list") {await pause(${listMs});result={tools:["intent_prepare","intent_accept","intent_cancel"].map(name=>({name,inputSchema:{type:"object"}}))};}
  else if(request.method==="tools/call") result={content:[],structuredContent:request.params.name==="intent_prepare"?{kind:"task",jobId:"fixture"}:{kind:"error",error:{code:"MODEL_ABORTED"}}};
  process.stdout.write(JSON.stringify({jsonrpc:"2.0",id:request.id,result})+"\\n");
});`);
  return { file, root };
}
it("accepts an 11-second startup within the automatic 15-second wait", async () => {
  const { file, root } = await server(11000);
  expect(await probeMcp(process.execPath, [file], root)).toMatchObject({ instances: ["default"] });
}, 20000);
it("bounds startup using the selected client wait", async () => {
  const { file, root } = await server(1000);
  await expect(probeMcp(process.execPath, [file], root, undefined, 100)).rejects.toThrow();
});
it("gives tool checks their own wait after initialization", async () => {
  const { file, root } = await server(0, 3500);
  expect(await probeMcp(process.execPath, [file], root, undefined, 3000)).toMatchObject({ instances: ["default"] });
}, 8000);
