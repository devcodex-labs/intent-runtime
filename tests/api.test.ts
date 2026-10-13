import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { gzipSync } from 'node:zlib';
import { once } from 'node:events';
import { Intent, IntentError, type ModelRequest } from '../src/index.js';
import { createApiExecutor } from '../src/adapters/api.js';
import { draft, observation } from './helpers.js';
import { CANDIDATE_SCHEMA } from '../src/contracts/generated.js';

async function endpoint(handler: (q: IncomingMessage, s: ServerResponse) => void): Promise<{url: string; server: Server; close: () => Promise<void>}> {
  const server = createServer(handler); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address() as {port: number};
  return {server, url: 'http://127.0.0.1:' + address.port, async close() {server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));}};
}
const request = (signal = new AbortController().signal): ModelRequest => ({instructions: 'Only structure supplied material', input: {language: 'en', request: {input: 'query order 000123'}}, outputSchema: CANDIDATE_SCHEMA, signal});
const reply = (text = JSON.stringify(draft())) => JSON.stringify({status: 'completed', output: [{type: 'message', role: 'assistant', content: [{type: 'output_text', text}]}]});

for (const provider of ['openai', 'xai'] as const) test('Responses ' + provider + ' performs exactly one request through Native and the real worker', async () => {
  let calls = 0, body: Record<string, any> | undefined, auth: string | undefined;
  const d = draft(); d.observations = [observation('orderId', '000123')];
  const e = await endpoint((q, s) => {calls++; assert.equal(q.url, '/v1/responses'); auth = q.headers.authorization; let text = ''; q.setEncoding('utf8'); q.on('data', c => text += c); q.on('end', () => {body = JSON.parse(text); s.end(reply(JSON.stringify(d)));});});
  const config = {provider, model: 'explicit-test-model', apiKey: 'synthetic-test-key', baseURL: e.url + '/v1'};
  const executor = createApiExecutor(config); config.model = 'mutated';
  const intent = new Intent({executor, schema: {type: 'object', properties: {orderId: {type: 'string'}}}});
  try {
    const result = await intent.parse({input: 'query order 000123', fields: ['orderId']}); assert.equal(result.effective.intents[0]!.inputs.orderId, '000123'); assert.equal(calls, 1);
    assert.equal(body!.model, 'explicit-test-model'); assert.equal(body!.store, false); assert.equal(body!.stream, false); assert.deepEqual(body!.tools, []); assert.equal(body!.text.format.type, 'json_schema'); assert.equal(auth, 'Bearer synthetic-test-key');
    assert.equal(body!.input[0].content[0].text.includes('synthetic-test-key'), false); assert.equal(JSON.stringify(result).includes('synthetic-test-key'), false);
  } finally {await intent.dispose(); await e.close();}
});

for (const [status, code] of [[401, 'MODEL_AUTH_FAILED'], [403, 'MODEL_AUTH_FAILED'], [429, 'MODEL_RATE_LIMITED'], [500, 'MODEL_REQUEST_FAILED']] as const) test('Responses maps HTTP ' + status + ' without exposing or retrying error bodies', async () => {
  let calls = 0; const e = await endpoint((_, s) => {calls++; s.writeHead(status); s.end('private error body');});
  try {await assert.rejects(createApiExecutor({provider: 'openai', model: 'test', apiKey: 'test', baseURL: e.url}).generate(request()), e => {assert(e instanceof IntentError); assert.equal(e.code, code); assert.equal(JSON.stringify(e).includes('private'), false); return true;}); assert.equal(calls, 1);} finally {await e.close();}
});

for (const status of [200, 401, 429]) test('Responses bounded body wins over HTTP ' + status + ' and counts visible bytes', async () => {
  const e = await endpoint((_, s) => {s.writeHead(status); s.end('123456789');});
  try {await assert.rejects(createApiExecutor({provider: 'openai', model: 'test', apiKey: 'test', baseURL: e.url, maxResponseBytes: 8}).generate(request()), {code: 'RESOURCE_LIMIT', stage: 'model', details: {limit: 'maxResponseBytes', allowed: 8, observed: 9, unit: 'bytes'}});} finally {await e.close();}
});

test('Responses accepts exactly the byte limit and supports an explicit text format', async () => {
  const text = reply(); let format: unknown; const e = await endpoint((q, s) => {let data = ''; q.setEncoding('utf8'); q.on('data', c => data += c); q.on('end', () => {format = JSON.parse(data).text.format; s.end(text);});});
  try {const r = await createApiExecutor({provider: 'xai', model: 'test', apiKey: 'test', baseURL: e.url, maxResponseBytes: Buffer.byteLength(text), format: 'text'}).generate(request()); assert.equal(r.outcome, 'complete'); assert.deepEqual(format, {type: 'text'});} finally {await e.close();}
});

test('Responses measures gzip after decompression rather than Content-Length', async () => {
  const data = reply('x'.repeat(10000)), compressed = gzipSync(data); assert(compressed.length < 1024);
  const e = await endpoint((_, s) => {s.writeHead(200, {'content-encoding': 'gzip', 'content-length': compressed.length}); s.end(compressed);});
  try {await assert.rejects(createApiExecutor({provider: 'openai', model: 'test', apiKey: 'test', baseURL: e.url, maxResponseBytes: 1024}).generate(request()), {code: 'RESOURCE_LIMIT', stage: 'model'});} finally {await e.close();}
});

test('Responses fatal UTF-8 never silently replaces invalid bytes', async () => {
  const e = await endpoint((_, s) => s.end(Buffer.from([0xff])));
  try {await assert.rejects(createApiExecutor({provider: 'openai', model: 'test', apiKey: 'test', baseURL: e.url}).generate(request()), {code: 'MODEL_REQUEST_FAILED'});} finally {await e.close();}
});

for (const [value, outcome] of [[{status: 'incomplete', output: []}, 'incomplete'], [{status: 'completed', output: [{type: 'message', role: 'assistant', content: [{type: 'refusal', refusal: 'declined'}]}]}, 'refusal']] as const) test('Responses preserves ' + outcome, async () => {
  const e = await endpoint((_, s) => s.end(JSON.stringify(value)));
  try {assert.equal((await createApiExecutor({provider: 'openai', model: 'test', apiKey: 'test', baseURL: e.url}).generate(request())).outcome, outcome);} finally {await e.close();}
});

for (const value of [{output: []}, {status: 'completed', output: []}, {status: 'completed', output: [{type: 'message', role: 'assistant', content: [{type: 'output_text', text: '{}'}, {type: 'output_text', text: '{}'}]}]}, {status: 'queued', output: []}]) test('Responses rejects incomplete or non-unique envelopes ' + JSON.stringify(value), async () => {
  const e = await endpoint((_, s) => s.end(JSON.stringify(value)));
  try {await assert.rejects(createApiExecutor({provider: 'openai', model: 'test', apiKey: 'test', baseURL: e.url}).generate(request()), {code: 'MODEL_REQUEST_FAILED'});} finally {await e.close();}
});

test('Responses never follows a redirect or forwards credentials to its target', async () => {
  let targetCalls = 0; const target = await endpoint((_, s) => {targetCalls++; s.end(reply());});
  const e = await endpoint((_, s) => {s.writeHead(307, {location: target.url}); s.end();});
  try {await assert.rejects(createApiExecutor({provider: 'openai', model: 'test', apiKey: 'test', baseURL: e.url}).generate(request()), {code: 'MODEL_REQUEST_FAILED'}); assert.equal(targetCalls, 0);} finally {await e.close(); await target.close();}
});

test('Responses abort during body wait remains REQUEST_ABORTED', async () => {
  const controller = new AbortController(); const e = await endpoint((_, s) => {s.writeHead(200); s.flushHeaders(); controller.abort();});
  try {await assert.rejects(createApiExecutor({provider: 'openai', model: 'test', apiKey: 'test', baseURL: e.url}).generate(request(controller.signal)), {code: 'REQUEST_ABORTED'});} finally {await e.close();}
});

for (const config of [{provider: 'unknown'}, {baseURL: 'http://api.example.com'}, {baseURL: 'https://user:password@example.com'}, {baseURL: 'https://example.com?q=1'}, {maxResponseBytes: 0}, {format: 'fallback'}]) test('Responses rejects unsafe or unknown configuration ' + JSON.stringify(config), () => {
  assert.throws(() => createApiExecutor({provider: 'openai', model: 'test', apiKey: 'test', ...config} as any), {code: 'CONFIG_INVALID'});
});
