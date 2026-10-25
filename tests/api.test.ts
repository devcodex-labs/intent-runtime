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
// These transport fixtures explicitly supply the provider's required SourceRef quote.
function wireText(value = draft(['n1'])): string {
  return JSON.stringify({...value, nodes: value.nodes.map(n => ({...n, sources: n.sources.map(s => ({...s, quote: s.quote ?? null}))})), changes: value.changes.map(c => ({...c, sources: c.sources.map(s => ({...s, quote: s.quote ?? null}))})), observations: value.observations.map(o => ({...o, sources: o.sources.map(s => ({...s, quote: s.quote ?? null}))}))});
}
const reply = (text = wireText()) => JSON.stringify({status: 'completed', output: [{type: 'message', role: 'assistant', content: [{type: 'output_text', text}]}]});

test('Chat Completions uses its own endpoint and schema request and validates through Native', async () => {
  let calls = 0;
  const d = draft(['n1']); d.observations = [observation('orderId', '000123', 'n1')];
  const e = await endpoint((q, s) => {
    calls++; assert.equal(q.url, '/v1/chat/completions');
    let text = ''; q.setEncoding('utf8'); q.on('data', c => text += c);
    q.on('end', () => {
      const body = JSON.parse(text);
      assert.equal(body.messages[0].role, 'system'); assert.equal(body.messages[1].role, 'user');
      assert.equal(body.response_format.type, 'json_schema'); assert.equal(body.response_format.json_schema.name, 'intent_candidate');
      assert.equal(body.response_format.json_schema.strict, true); assert.match(body.messages[0].content, /quote:null/);
      assert.equal(body.max_completion_tokens, 8192); assert.equal(body.stream, false); assert.equal(body.store, false);
      assert.equal(body.tools, undefined); assert.equal(body.input, undefined);
      s.end(JSON.stringify({choices: [{finish_reason: 'stop', message: {role: 'assistant', content: wireText(d)}}]}));
    });
  });
  const intent = new Intent({executor: createApiExecutor({provider: 'openai', protocol: 'chat-completions', model: 'gateway-model', apiKey: 'test', baseURL: e.url + '/v1'}), schema: {type: 'object', properties: {orderId: {type: 'string'}}}});
  try {
    const result = await intent.parse({input: 'query order 000123', fields: ['orderId']});
    assert.equal(result.effective.intents[0]!.inputs.orderId, '000123'); assert.equal(calls, 1);
  } finally {await intent.dispose(); await e.close();}
});

for (const [finish, message, expected] of [
  ['stop', {role: 'assistant', content: '{}'}, 'complete'],
  ['stop', {role: 'assistant', content: null, refusal: 'declined'}, 'refusal'],
  ['content_filter', {role: 'assistant', content: null}, 'refusal'],
  ['length', {role: 'assistant', content: '{'}, 'incomplete'],
] as const) test('Chat Completions maps ' + finish + '/' + expected, async () => {
  const e = await endpoint((q, s) => {q.resume(); s.end(JSON.stringify({choices: [{finish_reason: finish, message}]}));});
  try {assert.equal((await createApiExecutor({provider: 'openai', protocol: 'chat-completions', model: 'test', apiKey: 'test', baseURL: e.url, format: 'text'}).generate(request())).outcome, expected);} finally {await e.close();}
});

test('Chat Completions rejects tool calls and ambiguous choices and retains response limits', async () => {
  let body: unknown = {choices: [{finish_reason: 'tool_calls', message: {role: 'assistant', tool_calls: [{}]}}]};
  const e = await endpoint((q, s) => {q.resume(); s.end(JSON.stringify(body));});
  const config = {provider: 'openai', protocol: 'chat-completions', model: 'test', apiKey: 'test', baseURL: e.url} as const;
  try {
    await assert.rejects(createApiExecutor(config).generate(request()), {code: 'MODEL_REQUEST_FAILED'});
    body = {choices: [{}, {}]}; await assert.rejects(createApiExecutor(config).generate(request()), {code: 'MODEL_REQUEST_FAILED'});
    await assert.rejects(createApiExecutor({...config, maxResponseBytes: 1}).generate(request()), {code: 'RESOURCE_LIMIT'});
    assert.throws(() => createApiExecutor({...config, protocol: 'auto' as any}), {code: 'CONFIG_INVALID'});
  } finally {await e.close();}
});

for (const provider of ['openai', 'xai'] as const) test('Responses ' + provider + ' performs exactly one request through Native and the real worker', async () => {
  let calls = 0, body: Record<string, any> | undefined, auth: string | undefined;
  const d = draft(['n1']); d.observations = [observation('orderId', '000123', 'n1')];
  const e = await endpoint((q, s) => {calls++; assert.equal(q.url, '/v1/responses'); auth = q.headers.authorization; let text = ''; q.setEncoding('utf8'); q.on('data', c => text += c); q.on('end', () => {body = JSON.parse(text); s.end(reply(provider === 'openai' ? wireText(d) : JSON.stringify(d)));});});
  const config = {provider, model: 'explicit-test-model', apiKey: 'synthetic-test-key', baseURL: e.url + '/v1'};
  const executor = createApiExecutor(config); config.model = 'mutated';
  const intent = new Intent({executor, schema: {type: 'object', properties: {orderId: {type: 'string'}}}});
  try {
    const result = await intent.parse({input: 'query order 000123', fields: ['orderId']}); assert.equal(result.effective.intents[0]!.inputs.orderId, '000123'); assert.equal(calls, 1);
    assert.equal(body!.model, 'explicit-test-model'); assert.equal(body!.store, false); assert.equal(body!.stream, false); assert.deepEqual(body!.tools, []); assert.equal(body!.text.format.type, 'json_schema'); assert.equal(auth, 'Bearer synthetic-test-key');
    assert.equal(body!.input[0].content[0].text.includes('synthetic-test-key'), false); assert.equal(JSON.stringify(result).includes('synthetic-test-key'), false);
    assert.equal(body!.text.format.strict, provider === 'openai');
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

test('Responses actual default 8388608-byte envelope boundary includes ignored metadata and decompressed bytes', async () => {
  const skeleton = JSON.parse(reply()) as Record<string, unknown>; skeleton.padding = '';
  const padding = 'a'.repeat(8388608 - Buffer.byteLength(JSON.stringify(skeleton)));
  const exact = JSON.stringify({...skeleton, padding}), excessive = JSON.stringify({...skeleton, padding: padding + 'a'});
  assert.equal(Buffer.byteLength(exact), 8388608); assert.equal(Buffer.byteLength(excessive), 8388609);
  let body = exact, compressed = false, calls = 0;
  const e = await endpoint((_, s) => {calls++; const data = compressed ? gzipSync(body) : Buffer.from(body); if (compressed) s.writeHead(200, {'content-encoding': 'gzip', 'content-length': data.length}); s.end(data);});
  const executor = createApiExecutor({provider: 'openai', model: 'default-body-boundary', apiKey: 'synthetic', baseURL: e.url});
  try {
    assert.equal((await executor.generate(request())).outcome, 'complete');
    body = excessive;
    await assert.rejects(executor.generate(request()), (cause: unknown) => cause instanceof IntentError && cause.code === 'RESOURCE_LIMIT' && cause.details?.limit === 'maxResponseBytes' && cause.details.allowed === 8388608);
    compressed = true;
    await assert.rejects(executor.generate(request()), (cause: unknown) => cause instanceof IntentError && cause.code === 'RESOURCE_LIMIT' && cause.details?.limit === 'maxResponseBytes' && cause.details.allowed === 8388608);
    body = exact; assert.equal((await executor.generate(request())).outcome, 'complete');
    assert.equal(calls, 4);
  } finally {await e.close();}
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

test('SC-31 cancellation at EOF cannot publish a previously buffered valid API reply', async () => {
  const controller = new AbortController(), originalFetch = globalThis.fetch;
  let reads = 0, cancelled = false;
  // Fault injection isolates the transport race. Other tests use real HTTP;
  // this test does not claim provider or business-Validator compatibility.
  globalThis.fetch = async () => ({status: 200, body: {getReader() {return {
    async read() {
      if (reads++ === 0) return {done: false, value: new TextEncoder().encode(reply())};
      controller.abort(); return {done: true, value: undefined};
    },
    async cancel() {cancelled = true;},
    releaseLock() {},
  };}}}) as unknown as Response;
  try {
    await assert.rejects(createApiExecutor({provider: 'openai', model: 'transport-race', apiKey: 'synthetic'}).generate(request(controller.signal)), {code: 'REQUEST_ABORTED'});
    assert.equal(reads, 2); assert.equal(cancelled, true);
  } finally {globalThis.fetch = originalFetch;}
});

for (const [baseURL, allowed] of [
  ['http://127.0.0.1:8080/v1', true], ['http://localhost/v1', true], ['http://models.localhost/v1', true], ['http://[::1]/v1', true], ['http://[::ffff:127.0.0.1]/v1', true],
  ['http://10.0.0.1/v1', true], ['http://172.16.0.1/v1', true], ['http://172.31.255.255/v1', true], ['http://192.168.1.1/v1', true], ['http://[fc00::1]/v1', true], ['http://[fd12:3456::1]/v1', true],
  ['http://100.64.0.1/v1', true], ['http://100.127.255.255/v1', true],
  ['http://169.254.1.1/v1', false], ['http://169.254.169.254/v1', false], ['http://[fe80::1]/v1', false], ['http://[febf::1]/v1', false], ['http://100.63.255.255/v1', false], ['http://100.128.0.1/v1', false],
  ['http://172.32.0.1/v1', false], ['http://8.8.8.8/v1', false], ['http://[2001:db8::1]/v1', false], ['http://[::ffff:8.8.8.8]/v1', false], ['http://api.example.com/v1', false],
] as Array<[string, boolean]>) test('Plaintext baseURL ' + baseURL + (allowed ? ' is accepted as local/private' : ' is rejected'), () => {
  const create = () => createApiExecutor({provider: 'openai', model: 'test', apiKey: 'test', baseURL});
  if (allowed) assert.equal(typeof create().generate, 'function'); else assert.throws(create, {code: 'CONFIG_INVALID'});
});

for (const config of [{provider: 'unknown'}, {baseURL: 'http://api.example.com'}, {baseURL: 'https://user:password@example.com'}, {baseURL: 'https://example.com?q=1'}, {maxResponseBytes: 0}, {format: 'fallback'}]) test('Responses rejects unsafe or unknown configuration ' + JSON.stringify(config), () => {
  assert.throws(() => createApiExecutor({provider: 'openai', model: 'test', apiKey: 'test', ...config} as any), {code: 'CONFIG_INVALID'});
});
