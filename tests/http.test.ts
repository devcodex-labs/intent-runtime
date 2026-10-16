import test from 'node:test';
import assert from 'node:assert/strict';
import {Client, StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {startHttp} from '../src/mcp/http.js';
import {draft, observation} from './helpers.js';
import type {HostTask} from '../src/mcp/index.js';
import {request} from 'node:http';
import {publicOrigin} from '../src/mcp/http-origin.js';

for (const version of ['2025-06-18', '2025-11-25'] as const) test('HTTP SDK host keeps each client session through real prepare/accept: ' + version, async () => {
  const service = await startHttp({mode: 'host', instances: {orders: {schema: {type: 'object', properties: {orderId: {type: 'string'}}}}}}, {host: '127.0.0.1', port: 0, path: '/mcp'});
  const clients = [0, 1].map(() => new Client({name: 'http-integration', version: '1.0.0'}, {supportedProtocolVersions: [version], versionNegotiation: {mode: 'legacy'}}));
  const transports = clients.map(() => new StreamableHTTPClientTransport(new URL(service.url)));
  try {
    await Promise.all(clients.map((client, i) => client.connect(transports[i]!)));
    assert.deepEqual((await clients[0]!.listTools()).tools.map(t => t.name), ['intent_prepare', 'intent_accept', 'intent_cancel']);
    const prepared = await clients[0]!.callTool({name: 'intent_prepare', arguments: {input: 'query order 000123', fields: ['orderId']}});
    assert.equal(prepared.isError, false); const task = prepared.structuredContent as unknown as HostTask;
    const d = draft(); d.observations = [observation('orderId', '000123')];
    const args = {requestId: task.requestId, submissionToken: task.submissionToken, candidateText: JSON.stringify(d)};
    const foreign = await clients[1]!.callTool({name: 'intent_accept', arguments: args}); assert.equal(foreign.isError, true);
    const result = await clients[0]!.callTool({name: 'intent_accept', arguments: args});
    assert.equal(result.isError, false); assert.equal((result.structuredContent as any).effective.intents[0].inputs.orderId, '000123');
    const pending = await clients[0]!.callTool({name: 'intent_prepare', arguments: {input: 'query order 000123'}});
    const cancelled = await clients[0]!.callTool({name: 'intent_cancel', arguments: {requestId: (pending.structuredContent as unknown as HostTask).requestId}});
    assert.equal((cancelled.structuredContent as {status: string}).status, 'cancelled');
    assert.equal((await fetch(service.url, {method: 'POST', headers: {origin: 'https://other.example'}})).status, 403);
    assert.equal((await fetch(service.url, {method: 'POST', headers: {'mcp-session-id': 'unknown'}})).status, 404);
    await transports[0]!.terminateSession();
  } finally {await Promise.allSettled(clients.map(client => client.close())); await service.close();}
  await assert.rejects(fetch(service.url));
});

test('wildcard listener accepts only its explicitly configured proxy host and HTTPS origin', async () => {
  const service = await startHttp({mode:'host',instances:{main:{}}},{host:'0.0.0.0',port:0,path:'/mcp',publicOrigin:'https://mcp.example.test'});
  const local = service.url.replace('0.0.0.0','127.0.0.1');
  const post = (host: string, origin: string) => new Promise<number>((resolve,reject) => {
    const r = request(local,{method:'POST',headers:{host,origin,'content-type':'application/json',accept:'application/json, text/event-stream'}},s=>{s.resume();s.once('end',()=>resolve(s.statusCode!));});
    r.once('error',reject); r.end(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'proxy-test',version:'1'}}}));
  });
  try {
    assert.equal(await post('mcp.example.test','https://mcp.example.test'),200);
    assert.equal(await post('other.example.test','https://mcp.example.test'),403);
    assert.equal(await post('mcp.example.test','https://other.example.test'),403);
  } finally {await service.close();}
  await assert.rejects(fetch(local));
});

test('public origin rejects broad, credentialed or path-bearing values before listening', async () => {
  for (const value of ['https://*.example.test','https://user:secret@example.test','https://example.test/mcp','https://example.test?q=1','https://example.test#x','file:///tmp/mcp']) assert.throws(()=>publicOrigin(value));
  await assert.rejects(startHttp({mode:'host',instances:{main:{}}},{host:'0.0.0.0',port:0,path:'/mcp'}),/public origin/);
});
