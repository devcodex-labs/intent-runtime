import assert from 'node:assert/strict';
import {mkdirSync,appendFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {evaluationOutput} from './output.mjs';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {SCHEMA_PRESETS} from './schemas.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=evaluationOutput('semantic-guards',process.argv[2]);
mkdirSync(output,{recursive:true});
const core={normalizedInput:'Query order 002.',primaryIntent:'Query order',requirements:[],prohibitions:[],intents:[{action:'query',target:'Order 002',requirements:[],blockers:{clarificationReason:null,questions:[],confirmationReason:null,conditionReason:null}}]};
const badCore=structuredClone(core);badCore.normalizedInput='Delete order 002.';badCore.intents[0].action='delete';
const staleData={data:{orderId:'001'},evidence:[{path:'/data/orderId',mode:'exact',sources:[{sourceId:'context:0',quote:'001'}]}],descriptionChecks:[{path:'/data/orderId',verdict:'satisfied',explanation:'Deliberately wrong claim that the historical identifier is current.',sources:[{sourceId:'context:0',quote:'001'}]}],fieldResults:[{path:'/data/orderId',status:'extracted',explanation:'Deliberately wrong current-scope choice.'}],issues:[]};
const omittedData={data:{},evidence:[],descriptionChecks:[],fieldResults:[{path:'/data/projectName',status:'not_provided',explanation:'Deliberately wrong omission despite explicit input.'},{path:'/data/issueType',status:'not_provided',explanation:'No issue type.'}],issues:[]};
const cases=[
 {name:'合法结构的错误动作',request:{input:'Only query order 002; do not delete it.',fields:[]},schema:null,candidates:[badCore],correctExpectation:'query only; prohibition retained'},
 {name:'来源命中但值已过时',request:{input:'Query order 002. The request for 001 is withdrawn.',context:[{role:'user',content:'Previously query order 001.'}]},schema:SCHEMA_PRESETS.singleOrder,candidates:[core,staleData],correctExpectation:'data.orderId=002, never historical 001'},
 {name:'有明确事实的可选字段被漏提',request:{input:'Analyze order-service configuration.'},schema:SCHEMA_PRESETS.project,candidates:[{...core,normalizedInput:'Analyze order-service configuration.',intents:[{...core.intents[0],action:'analyze',target:'order-service configuration'}]},omittedData],correctExpectation:'data.projectName=order-service'},
];
const results=[];
for(const test of cases) {
 const client=new Client({name:'intent-runtime-semantic-guard-probe',version:'1'});
 const options={instance:test.schema?{schema:JSON.parse(JSON.stringify(test.schema))}:{}};
 const transport=new StdioClientTransport({command:process.execPath,args:[join(root,'evaluations/mcp-protocol-server.mjs'),JSON.stringify(options)],cwd:root,stderr:'pipe'});
 try {
  await client.connect(transport);
  async function call(name,args){const r=await client.callTool({name,arguments:args});appendFileSync(join(output,'transcript.jsonl'),JSON.stringify({probe:test.name,name,args,response:r})+'\n');return r.structuredContent;}
  let reply=await call('intent_prepare',{instance:'test',...test.request});
  for(const candidate of test.candidates){assert.equal(reply.kind,'task');reply=await call('intent_accept',{jobId:reply.jobId,stepToken:reply.stepToken,candidateText:JSON.stringify(candidate)});}
  assert.equal(reply.kind,'result');
  results.push({name:test.name,correctExpectation:test.correctExpectation,observed:reply.result,semanticMismatchAccepted:true});
 }finally{const pid=transport.pid;await client.close();if(pid)assert.throws(()=>process.kill(pid,0),e=>e.code==='ESRCH');}
}
writeFileSync(join(output,'probes.json'),JSON.stringify({candidateSource:'deliberately incorrect controlled candidates, not model generations',node:process.version,providerApiCalls:0,scope:'Demonstrates the deterministic validator cannot independently establish semantic correctness; exclude from accuracy scores.',mismatchesAccepted:results.length,results},null,2)+'\n');
console.log(JSON.stringify({probes:results.length,semanticMismatchesAccepted:results.length,accuracySamples:0}));
