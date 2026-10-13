import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {mkdtemp, writeFile, readFile} from 'node:fs/promises';
import path from 'node:path';
import {draft, observation} from './helpers.js';
import type {HostTask} from '../src/mcp/index.js';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

for (const version of ['2025-06-18', '2025-11-25', '2026-07-28'] as const) test('Actual SDK stdio host -> candidate -> real worker -> result: ' + version, async () => {
  const dir = await mkdtemp(path.join(process.env.INTENT_TEST_DIR!, 'stdio-')), config = path.join(dir, 'host.mjs');
  await writeFile(config, "export default {mode:'host',instances:{orders:{schema:{type:'object',properties:{orderId:{type:'string'}}}}}};\n");
  const transport = new StdioClientTransport({command: process.execPath, args: [path.join(process.env.INTENT_PACKAGE_TEST_ROOT!, 'dist/cli/mcp.js'), '--config', config], stderr: 'pipe'});
  let stderr = ''; transport.stderr?.on('data', c => {stderr += c;});
  const client = new Client({name: 'fixed-real-sdk-client', version: '1.0.0'}, {supportedProtocolVersions: [version], versionNegotiation: {mode: version === '2026-07-28' ? {pin: version} : 'legacy'}});
  try {
    await client.connect(transport); assert.equal(client.getNegotiatedProtocolVersion(), version); assert.equal(client.getProtocolEra(), version === '2026-07-28' ? 'modern' : 'legacy');
    const listed = await client.listTools(); assert.deepEqual(listed.tools.map(t => t.name), ['intent_prepare', 'intent_accept', 'intent_cancel']);
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

for (const version of ['2025-06-18', '2025-11-25', '2026-07-28'] as const) test('Actual SDK stdio executor uses Native and emits the exact wire envelope: ' + version, async () => {
  const dir = await mkdtemp(path.join(process.env.INTENT_TEST_DIR!, 'stdio-executor-')), config = path.join(dir, 'executor.mjs');
  const d = draft(); d.observations = [observation('orderId', '000123')];
  await writeFile(config, `const candidate=${JSON.stringify(d)}; export default {mode:'executor',instances:{orders:{schema:{type:'object',properties:{orderId:{type:'string'}}},executor:{id:'controlled-language-only',async generate(request){if(!request.outputSchema.properties)throw new Error('No candidate schema');return {outcome:'complete',text:JSON.stringify(candidate)}}}}}};`);
  const transport = new StdioClientTransport({command: process.execPath, args: [path.join(process.env.INTENT_PACKAGE_TEST_ROOT!, 'dist/cli/mcp.js'), '--config', config], stderr: 'pipe'}); transport.stderr?.on('data', () => {});
  const client = new Client({name: 'fixed-sdk-executor', version: '1.0.0'}, {supportedProtocolVersions: [version], versionNegotiation: {mode: version === '2026-07-28' ? {pin: version} : 'legacy'}});
  try {
    await client.connect(transport); const wire: any[] = [], receive = transport.onmessage;
    transport.onmessage = message => {if (Array.isArray((message as any).result?.content)) wire.push((message as any).result); receive?.(message);};
    assert.equal(client.getNegotiatedProtocolVersion(), version); assert.deepEqual((await client.listTools()).tools.map(t => t.name), ['intent_parse']);
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
