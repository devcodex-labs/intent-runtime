import {Server, ProtocolError} from '@modelcontextprotocol/server';
import {Intent} from '../intent.js';
import {IntentError} from '../contracts/errors.js';
import {plain, cloneJson} from '../internal/json.js';
import {PACKAGE_VERSION} from '../internal/version.js';
import {createIntentMcpAdapter, type IntentMcpServerConfig, type IntentMcpSession, type IntentMcpProtocolVersion} from './index.js';

// Both standalone transports own the instances. Embedded adapters continue to
// borrow their caller's Intent and are independent of this SDK binding.
export function createSdkBinding(config: IntentMcpServerConfig) {
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
  return {
    createServer(versions: IntentMcpProtocolVersion[] = ['2025-06-18', '2025-11-25', '2026-07-28']) {
      const server = new Server({name: 'intent-runtime', version: PACKAGE_VERSION}, {capabilities: {tools: {}}, supportedProtocolVersions: versions});
      let session: IntentMcpSession | undefined;
      server.setRequestHandler('tools/list', async () => ({tools: adapter.tools.map(t => ({
        ...cloneJson(t),
        ...(config.mode === 'host' ? {annotations: {readOnlyHint: true, destructiveHint: false, openWorldHint: false}} : {}),
        inputSchema: {...cloneJson(t.inputSchema), type: 'object' as const},
      }))}));
      server.setRequestHandler('tools/call', async (request, context) => {
        session ??= adapter.connect({protocolVersion: server.getNegotiatedProtocolVersion() as IntentMcpProtocolVersion});
        const reply = await session.callTool(request.params.name, request.params.arguments ?? {}, {signal: context.mcpReq.signal});
        if (!reply) throw new ProtocolError(-32602, 'Unknown tool');
        return reply;
      });
      server.onclose = () => {void session?.close();};
      return server;
    },
    async close() {try {await adapter.close();} finally {await Promise.all(Object.values(instances).map(i => i.dispose()));}},
  };
}
