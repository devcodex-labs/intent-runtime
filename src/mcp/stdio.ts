import { Server, ProtocolError } from '@modelcontextprotocol/server';
import { serveStdio, StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import type { Transport } from '@modelcontextprotocol/server';
import { Intent } from '../intent.js';
import { IntentError } from '../contracts/errors.js';
import { plain, cloneJson } from '../internal/json.js';
import {PACKAGE_VERSION} from '../internal/version.js';
import { createIntentMcpAdapter, type IntentMcpServerConfig, type IntentMcpSession, type IntentMcpProtocolVersion } from './index.js';

// The SDK owns protocol parsing, era selection, discover and request envelopes.
// This binding owns only instances created from the selected trusted config.
export function startStdio(config: IntentMcpServerConfig, transport: Transport = new StdioServerTransport()): {close(): Promise<void>; closed: Promise<void>} {
  if (!plain(config) || Reflect.ownKeys(config).some(k => typeof k !== 'string' || !['mode', 'instances', 'toolPrefix'].includes(k) || !('value' in Object.getOwnPropertyDescriptor(config, k)!)) || !plain(config.instances)) throw new IntentError('CONFIG_INVALID', {stage: 'transport'});
  const instances: Record<string, Intent> = Object.create(null);
  let adapter: ReturnType<typeof createIntentMcpAdapter>;
  try {
    for (const key of Reflect.ownKeys(config.instances)) {
      const d = Object.getOwnPropertyDescriptor(config.instances, key);
      if (typeof key !== 'string' || !d || !('value' in d) || !d.enumerable) throw new IntentError('CONFIG_INVALID', {stage: 'transport'});
      instances[key] = new Intent(d.value);
    }
    adapter = createIntentMcpAdapter({instances, ...(config.mode === undefined ? {} : {mode: config.mode}), ...(config.toolPrefix === undefined ? {} : {toolPrefix: config.toolPrefix})});
  } catch (error) {for (const intent of Object.values(instances)) void intent.dispose(); throw error;}
  let resolveClosed!: () => void; const closed = new Promise<void>(resolve => {resolveClosed = resolve;});
  let stopping: Promise<void> | undefined;
  const handle = serveStdio(() => {
    const server = new Server({name: 'intent-runtime', version: PACKAGE_VERSION}, {capabilities: {tools: {}}, supportedProtocolVersions: ['2025-06-18', '2025-11-25', '2026-07-28']});
    let session: IntentMcpSession | undefined;
    server.setRequestHandler('tools/list', async () => ({tools: adapter.tools.map(t => ({...cloneJson(t), inputSchema: {...cloneJson(t.inputSchema), type: 'object' as const}}))}));
    server.setRequestHandler('tools/call', async (request, context) => {
      session ??= adapter.connect({protocolVersion: server.getNegotiatedProtocolVersion() as IntentMcpProtocolVersion});
      const response = await session.callTool(request.params.name, request.params.arguments ?? {}, {signal: context.mcpReq.signal});
      if (!response) throw new ProtocolError(-32602, 'Unknown tool');
      return response;
    });
    server.onclose = () => {void session?.close();};
    return server;
  }, {transport, onerror: () => {process.stderr.write('Intent MCP transport failed.\n');}});
  const close = (): Promise<void> => {
    stopping ??= Promise.resolve().then(async () => {try {await handle.close();} finally {await adapter.close(); await Promise.all(Object.values(instances).map(i => i.dispose())); resolveClosed();}});
    return stopping;
  };
  const sdkClose = transport.onclose;
  transport.onclose = () => {sdkClose?.(); void close();};
  return {close, closed};
}
