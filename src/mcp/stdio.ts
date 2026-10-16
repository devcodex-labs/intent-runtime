import { serveStdio, StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import type { Transport } from '@modelcontextprotocol/server';
import type {IntentMcpServerConfig} from './index.js';
import {createSdkBinding} from './sdk.js';

// The SDK owns protocol parsing, era selection, discover and request envelopes.
// This binding owns only instances created from the selected trusted config.
export function startStdio(config: IntentMcpServerConfig, transport: Transport = new StdioServerTransport()): {close(): Promise<void>; closed: Promise<void>} {
  const binding = createSdkBinding(config);
  let resolveClosed!: () => void; const closed = new Promise<void>(resolve => {resolveClosed = resolve;});
  let stopping: Promise<void> | undefined;
  const handle = serveStdio(() => binding.createServer(), {transport, onerror: () => {process.stderr.write('Intent MCP transport failed.\n');}});
  const close = (): Promise<void> => {
    stopping ??= Promise.resolve().then(async () => {try {await handle.close();} finally {await binding.close(); resolveClosed();}});
    return stopping;
  };
  const sdkClose = transport.onclose;
  transport.onclose = () => {sdkClose?.(); void close();};
  return {close, closed};
}
