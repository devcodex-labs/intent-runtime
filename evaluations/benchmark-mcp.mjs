import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {cpus,platform,arch} from 'node:os';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {SCHEMA_PRESETS} from './schemas.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const output=resolve(process.argv[2]??join(root,'evaluations/results',Date.now()+'-benchmark'));
mkdirSync(output,{recursive:true});
const count=100, warmups=5;
const input='Query order 000123.';
const core={normalizedInput:input,primaryIntent:'Query order',requirements:[],prohibitions:[],intents:[{action:'query',target:'Order 000123',requirements:[],blockers:{clarificationReason:null,questions:[],confirmationReason:null,conditionReason:null}}]};
const data={data:{orderId:'000123'},evidence:[{path:'/data/orderId',mode:'exact',sources:[{sourceId:'input',quote:'000123'}]}],descriptionChecks:[{path:'/data/orderId',verdict:'satisfied',explanation:'Current order.',sources:[{sourceId:'input',quote:'000123'}]}],fieldResults:[{path:'/data/orderId',status:'extracted',explanation:'Current order.'}],issues:[]};
const percentile=(values,q)=>[...values].sort((a,b)=>a-b)[Math.max(0,Math.ceil(values.length*q)-1)];
const stats=values=>({samples:values.length,p50Ms:percentile(values,.5),p95Ms:percentile(values,.95),maxMs:Math.max(...values)});
const schemas=JSON.parse(JSON.stringify(SCHEMA_PRESETS.singleOrder));
const largeSchema=structuredClone(schemas);
for(let i=0;i<255;i++)largeSchema.properties['optional_'+i]={type:'string'};
const largeData=structuredClone(data);
for(let i=0;i<255;i++)largeData.fieldResults.push({path:'/data/optional_'+i,status:'not_provided',explanation:'No corresponding fact.'});
const scenarios=[
  {name:'core_only',fields:[]},
  {name:'core_and_data'},
  {name:'core_repair_and_data',repair:true},
  {name:'large_input',samples:16,input:input+'\n'+'Background reference only. '.repeat(2000)},
  {name:'256_schema_properties',schema:largeSchema,data:largeData},
  {name:'four_concurrent_requests',concurrency:4},
];
const records=[];
for(const scenario of scenarios) {
  const client=new Client({name:'intent-runtime-processing-benchmark',version:'1'});
  const options={instance:{schema:scenario.schema??schemas}};
  const transport=new StdioClientTransport({command:process.execPath,args:[join(root,'evaluations/mcp-protocol-server.mjs'),JSON.stringify(options)],cwd:root,stderr:'pipe'});
  let stderr='';transport.stderr?.on('data',value=>{stderr+=value;});
  const stageLatencies=[];let calls=0;
  async function call(name,args) {
    const start=performance.now();const r=await client.callTool({name,arguments:args});
    const durationMs=performance.now()-start;calls++;stageLatencies.push({name,durationMs,kind:r.structuredContent?.kind});
    assert.equal(r.isError??false,false);return r.structuredContent;
  }
  async function run() {
    const start=performance.now();
    const exactInput=scenario.input??input;
    let task=await call('intent_prepare',{instance:'test',input:exactInput,...(scenario.fields?{fields:scenario.fields}:{})});
    assert.equal(task.kind,'task');
    const submit=value=>call('intent_accept',{jobId:task.jobId,stepToken:task.stepToken,candidateText:typeof value==='string'?value:JSON.stringify(value)});
    if(scenario.repair){task=await submit('{bad');assert.equal(task.kind,'task');}
    task=await submit(core);
    if(task.kind==='task'){assert.equal(task.stage,'data');task=await submit(scenario.data??data);}
    assert.equal(task.kind,'result');assert.equal(task.result.input,exactInput);
    assert.deepEqual(task.result.data,scenario.fields?.length===0?{}:{orderId:'000123'});
    return performance.now()-start;
  }
  const connectStart=performance.now();
  try {
    await client.connect(transport);const startupMs=performance.now()-connectStart;
    const coldRequestMs=await run();for(let i=0;i<warmups;i++)await run();
    const latencyOffset=stageLatencies.length;
    const values=[];const measuredStart=performance.now();const sampleCount=scenario.samples??count;
    for(let i=0;i<sampleCount;i+=scenario.concurrency??1)values.push(...await Promise.all(Array.from({length:scenario.concurrency??1},()=>run())));
    const elapsedMs=performance.now()-measuredStart;
    const result={scenario:scenario.name,configuration:{inputBytes:Buffer.byteLength(scenario.input??input),schemaProperties:Object.keys((scenario.schema??schemas).properties).length,concurrency:scenario.concurrency??1},startupMs,coldRequestMs,warmups,requests:stats(values),toolRoundTrips:stats(stageLatencies.slice(latencyOffset).map(x=>x.durationMs)),measuredElapsedMs:elapsedMs,controlledRequestsPerSecond:sampleCount*1000/elapsedMs,totalToolCallsIncludingWarmups:calls,requestLatenciesMs:values};
    records.push(result);console.log(JSON.stringify({...result,requestLatenciesMs:undefined}));
  } finally {
    const pid=transport.pid;await client.close();if(pid)assert.throws(()=>process.kill(pid,0),error=>error.code==='ESRCH');
    assert.equal(stderr,'');
  }
}
const summary={node:process.version,platform:platform(),arch:arch(),cpu:cpus()[0]?.model,logicalCpus:cpus().length,providerApiCalls:0,candidateSource:'controlled fixtures; model generation time is zero',scope:'Local runtime and SDK stdio processing only. Excludes target-model latency, network latency and desktop scheduling. Not a production SLA.',scenarios:records};
writeFileSync(join(output,'benchmark.json'),JSON.stringify(summary,null,2)+'\n');
