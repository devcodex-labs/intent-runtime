import test from 'node:test';
import assert from 'node:assert/strict';
import {Client, StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {startHttp} from '../src/mcp/http.js';
import {draft, observation} from './helpers.js';
import type {HostTask} from '../src/mcp/index.js';

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
