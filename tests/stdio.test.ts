import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {mkdtemp, writeFile, readFile} from 'node:fs/promises';
import path from 'node:path';
import {draft, observation} from './helpers.js';
import type {HostTask} from '../src/mcp/index.js';
import {Intent} from '../src/index.js';
import {createIntentMcpAdapter} from '../src/mcp/index.js';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {InMemoryTransport} from '@modelcontextprotocol/server';
import {startStdio} from '../src/mcp/stdio.js';

test('SC-37 actual SDK send failure after host commit preserves the real validated reply for same-session replay', async () => {
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const send = serverTransport.send.bind(serverTransport);
  const lostReply = new AbortController();
  let committed: unknown, dropped = false;
  serverTransport.send = async (message, options) => {
    if (!dropped && 'result' in message && (message.result as {structuredContent?: {schemaVersion?: string}}).structuredContent?.schemaVersion === '2.0-draft.6') {
      committed = structuredClone(message.result); dropped = true;
      // End the waiting client only AFTER the real validated reply was
      // committed. A short wall-clock timeout could cancel a slow worker
      // before reaching the send fault when other suites run concurrently.
      queueMicrotask(() => lostReply.abort());
      throw new Error('PRIVATE_SYNTHETIC_SEND_FAILURE');
    }
    await send(message, options);
  };
  const host = startStdio({mode: 'host', instances: {orders: {schema: {type: 'object', properties: {orderId: {type: 'string'}}}}}}, serverTransport);
  const client = new Client({name: 'actual-sdk-send-race', version: '1.0.0'}, {supportedProtocolVersions: ['2025-06-18'], versionNegotiation: {mode: 'legacy'}});
  try {
    await client.connect(clientTransport);
    const prepared = await client.callTool({name: 'intent_prepare', arguments: {input: 'query order 000123', fields: ['orderId'], output: {diagnostics: true}}});
    const task = prepared.structuredContent as unknown as HostTask;
    const d = draft(); d.observations = [observation('orderId', '000123')];
    const args = {requestId: task.requestId, submissionToken: task.submissionToken, candidateText: JSON.stringify(d)};
    await assert.rejects(client.callTool({name: 'intent_accept', arguments: args}, {signal: lostReply.signal}));
    assert.equal(dropped, true);
    const replay = await client.callTool({name: 'intent_accept', arguments: args});
    assert.deepEqual(replay, committed);
    assert.equal((replay.structuredContent as any).effective.intents[0].inputs.orderId, '000123');
    // Exact replay includes the original generated IDs and business-validated
    // values; do not invent a public validation counter for this assertion.
    assert.equal((replay.structuredContent as any).diagnostics.modelCallCount, 0);
  } finally {await client.close(); await host.close();}
});

for (const version of ['2025-06-18', '2025-11-25', '2026-07-28'] as const) test('Actual SDK carries default 1048576-byte HostTask and candidate without truncation: ' + version, async () => {
  const configData = {language: 'en', semantics: {description: ''}}, input = 'query A';
  const measuring = new Intent(configData), adapter = createIntentMcpAdapter({mode: 'host', instances: {main: measuring}}), session = adapter.connect({protocolVersion: version});
  try {
    const sample = await session.callTool('intent_prepare', {input}); assert.equal(sample!.isError, false);
    configData.semantics.description = 'a'.repeat(1048576 - Buffer.byteLength(JSON.stringify(sample!.structuredContent)));
  } finally {await adapter.close(); await measuring.dispose();}
  const dir = await mkdtemp(path.join(process.env.INTENT_TEST_DIR!, 'large-stdio-')), config = path.join(dir, 'host.mjs');
  await writeFile(config, 'export default ' + JSON.stringify({mode: 'host', instances: {main: configData}}) + ';\n');
  const transport = new StdioClientTransport({command: process.execPath, args: [path.join(process.env.INTENT_PACKAGE_TEST_ROOT!, 'dist/cli/mcp.js'), '--config', config], stderr: 'pipe'}); transport.stderr?.on('data', () => {});
  const client = new Client({name: 'actual-sdk-size-boundary', version: '1.0.0'}, {supportedProtocolVersions: [version], versionNegotiation: {mode: version === '2026-07-28' ? {pin: version} : 'legacy'}});
  try {
    await client.connect(transport);
    const prepared = await client.callTool({name: 'intent_prepare', arguments: {input}}); assert.equal(prepared.isError, false);
    const task = prepared.structuredContent as unknown as HostTask;
    assert.equal(Buffer.byteLength(JSON.stringify(task)), 1048576);
    assert.deepEqual(JSON.parse((prepared.content[0] as {text: string}).text), task);
    const d = draft(); d.messages.changed = ''; d.messages.changed = 'a'.repeat(1048576 - Buffer.byteLength(JSON.stringify(d)));
    const candidateText = JSON.stringify(d); assert.equal(Buffer.byteLength(candidateText), 1048576);
    const result = await client.callTool({name: 'intent_accept', arguments: {requestId: task.requestId, submissionToken: task.submissionToken, candidateText}});
    assert.equal(result.isError, false); assert.equal((result.structuredContent as any).turn.intentIds.length, 1);
  } finally {await client.close();}
});

for (const version of ['2025-06-18', '2025-11-25', '2026-07-28'] as const) test('Actual SDK stdio host -> candidate -> real worker -> result: ' + version, async () => {
  const dir = await mkdtemp(path.join(process.env.INTENT_TEST_DIR!, 'stdio-')), config = path.join(dir, version === '2025-06-18' ? 'host.js' : 'host.mjs');
  await writeFile(path.join(dir, 'package.json'), JSON.stringify({type: 'module'}));
  await writeFile(config, "export default {mode:'host',instances:{orders:{schema:{type:'object',properties:{orderId:{type:'string'}}}}}};\n");
  const transport = new StdioClientTransport({command: process.execPath, args: [path.join(process.env.INTENT_PACKAGE_TEST_ROOT!, 'dist/cli/mcp.js'), '--config', config], stderr: 'pipe'});
  let stderr = ''; transport.stderr?.on('data', c => {stderr += c;});
  const client = new Client({name: 'fixed-real-sdk-client', version: '1.0.0'}, {supportedProtocolVersions: [version], versionNegotiation: {mode: version === '2026-07-28' ? {pin: version} : 'legacy'}});
  try {
    await client.connect(transport); assert.equal(client.getNegotiatedProtocolVersion(), version); assert.equal(client.getProtocolEra(), version === '2026-07-28' ? 'modern' : 'legacy');
    const listed = await client.listTools(); assert.deepEqual(listed.tools.map(t => t.name), ['intent_prepare', 'intent_accept', 'intent_cancel']);
    for (const tool of listed.tools) assert.deepEqual(tool.annotations, {readOnlyHint: true, destructiveHint: false, openWorldHint: false});
    const prepared = await client.callTool({name: 'intent_prepare', arguments: {input: 'query order 000123', fields: ['orderId']}}), task = prepared.structuredContent as unknown as HostTask;
    assert.equal(prepared.isError, false); assert.equal(task.kind, 'model_task');
    const d = draft(); d.observations = [observation('orderId', '000123')];
    const result = await client.callTool({name: 'intent_accept', arguments: {requestId: task.requestId, submissionToken: task.submissionToken, candidateText: JSON.stringify(d)}});
    assert.equal(result.isError, false); assert.equal((result.structuredContent as any).effective.intents[0].inputs.orderId, '000123');
    const bad = await client.callTool({name: 'intent_prepare', arguments: {input: 'query', mode: 'executor'}}); assert.equal(bad.isError, true); assert.equal('structuredContent' in bad, false);
    assert.equal(stderr, '');
  } finally {await client.close();}
});

test('Standalone MCP help/version and invalid arguments do not import a configuration', () => {
  const cli = path.join(process.env.INTENT_PACKAGE_TEST_ROOT!, 'dist/cli/mcp.js');
  for (const [args, exit] of [[['--help'], 0], [['--version'], 0], [[], 2], [['--config', 'relative.mjs'], 2], [['--unknown'], 2]] as const) {
    const r = spawnSync(process.execPath, [cli, ...args], {encoding: 'utf8'}); assert.equal(r.status, exit); assert.equal(r.signal, null);
  }
});

test('Invalid public origin and HTTP-only CLI options reject before importing configuration', async () => {
  const dir = await mkdtemp(path.join(process.env.INTENT_TEST_DIR!,'invalid-http-')), config = path.join(dir,'never-import.mjs');
  await writeFile(config,"throw new Error('Must not be imported');\n");
  const cli = path.join(process.env.INTENT_PACKAGE_TEST_ROOT!,'dist/cli/mcp.js');
  for (const extra of [
    ['--public-origin','https://example.test'],
    ['--transport','http','--host','0.0.0.0'],
    ['--transport','http','--public-origin','https://example.test/mcp'],
    ['--transport','http','--public-origin','https://*.example.test'],
    ['--transport','http','--public-origin','https://user:secret@example.test'],
  ]) {
    const r = spawnSync(process.execPath,[cli,'--config',config,...extra],{encoding:'utf8'});
    assert.equal(r.status,2); assert(!r.stderr.includes('startup failed')); assert.equal(r.stdout,'');
  }
});

for (const version of ['2025-06-18', '2025-11-25', '2026-07-28'] as const) test('Actual SDK stdio executor uses Native and emits the exact wire envelope: ' + version, async () => {
  const dir = await mkdtemp(path.join(process.env.INTENT_TEST_DIR!, 'stdio-executor-')), config = path.join(dir, 'executor.mjs');
  const d = draft(); d.observations = [observation('orderId', '000123')];
  await writeFile(config, `const candidate=${JSON.stringify(d)}; export default {mode:'executor',instances:{orders:{schema:{type:'object',properties:{orderId:{type:'string'}}},executor:{id:'controlled-language-only',async generate(request){if(!request.outputSchema.properties)throw new Error('No candidate schema');return {outcome:'complete',text:JSON.stringify(candidate)}}}}}};`);
  const transport = new StdioClientTransport({command: process.execPath, args: [path.join(process.env.INTENT_PACKAGE_TEST_ROOT!, 'dist/cli/mcp.js'), '--config', config], stderr: 'pipe'}); transport.stderr?.on('data', () => {});
  const client = new Client({name: 'fixed-sdk-executor', version: '1.0.0'}, {supportedProtocolVersions: [version], versionNegotiation: {mode: version === '2026-07-28' ? {pin: version} : 'legacy'}});
  try {
    await client.connect(transport); const wire: any[] = [], receive = transport.onmessage;
    transport.onmessage = message => {if (Array.isArray((message as any).result?.content)) wire.push((message as any).result); receive?.(message);};
    assert.equal(client.getNegotiatedProtocolVersion(), version); const listed = await client.listTools(); assert.deepEqual(listed.tools.map(t => t.name), ['intent_parse']);
    assert.equal(listed.tools[0]!.annotations?.readOnlyHint, undefined);
    const r = await client.callTool({name: 'intent_parse', arguments: {input: 'query order 000123', fields: ['orderId']}}); assert.equal((r.structuredContent as any).effective.intents[0].inputs.orderId, '000123');
    assert.equal(wire.length, 1); assert.equal(Object.hasOwn(wire[0], 'resultType'), version === '2026-07-28'); if (version === '2026-07-28') assert.equal(wire[0].resultType, 'complete');
    await assert.rejects(client.callTool({name: 'unknown', arguments: {}}), {code: -32602});
  } finally {await client.close();}
});

for (const version of ['2025-06-18', '2025-11-25', '2026-07-28'] as const) test('Actual SDK cancellation reaches only the active executor signal: ' + version, async () => {
  const dir = await mkdtemp(path.join(process.env.INTENT_TEST_DIR!, 'stdio-cancel-')), config = path.join(dir, 'executor.mjs'), started = path.join(dir, 'started'), aborted = path.join(dir, 'aborted');
  const indexURL = pathToFileURL(path.join(process.env.INTENT_PACKAGE_TEST_ROOT!, 'dist/index.js')).href;
  await writeFile(config, `import {writeFile} from 'node:fs/promises'; import {IntentError} from ${JSON.stringify(indexURL)};
export default {mode:'executor',instances:{main:{executor:{id:'observed-cancellation',async generate({signal}){await writeFile(${JSON.stringify(started)},'started');return new Promise((resolve,reject)=>{const stop=()=>{writeFile(${JSON.stringify(aborted)},'aborted').then(()=>reject(new IntentError('REQUEST_ABORTED')))};if(signal.aborted)stop();else signal.addEventListener('abort',stop,{once:true});});}}}}};`);
  const transport = new StdioClientTransport({command: process.execPath, args: [path.join(process.env.INTENT_PACKAGE_TEST_ROOT!, 'dist/cli/mcp.js'), '--config', config], stderr: 'pipe'}); transport.stderr?.on('data', () => {});
  const client = new Client({name: 'fixed-sdk-cancellation', version: '1.0.0'}, {supportedProtocolVersions: [version], versionNegotiation: {mode: version === '2026-07-28' ? {pin: version} : 'legacy'}});
  const waitFile = async (file: string) => {for (let i = 0; i < 500; i++) {try {const value = await readFile(file, 'utf8'); if (value.length) return value;} catch {} await new Promise(resolve => setTimeout(resolve, 10));} throw new Error('Observed executor signal did not complete.');};
  try {
    await client.connect(transport); await client.listTools(); const controller = new AbortController();
    const rejected = assert.rejects(client.callTool({name: 'intent_parse', arguments: {input: 'query'}}, {signal: controller.signal}));
    assert.equal(await waitFile(started), 'started'); controller.abort(); await rejected; assert.equal(await waitFile(aborted), 'aborted');
  } finally {await client.close();}
});
