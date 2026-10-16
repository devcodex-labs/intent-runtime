import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {randomUUID} from 'node:crypto';
import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/server';
import type {IntentMcpServerConfig} from './index.js';
import {createSdkBinding} from './sdk.js';

// Stateful Streamable HTTP uses one SDK server and adapter session per client.
// The 2025 session protocol is intentional; modern per-request MCP is not a
// substitute for the host prepare/accept conversation's logical identity.
export async function startHttp(config: IntentMcpServerConfig, options: {host: string; port: number; path: string}) {
  const binding = createSdkBinding(config);
  type Connection = {transport: WebStandardStreamableHTTPServerTransport; server: ReturnType<typeof binding.createServer>; touched: number};
  const sessions = new Map<string, Connection>(), connections = new Set<Connection>();
  let stopping: Promise<void> | undefined, resolveClosed!: () => void;
  const closed = new Promise<void>(resolve => {resolveClosed = resolve;});
  const dispose = async (connection: Connection) => {
    connections.delete(connection);
    if (connection.transport.sessionId) sessions.delete(connection.transport.sessionId);
    await connection.server.close();
  };
  const http = createServer((incoming, outgoing) => {void (async () => {
    const address = http.address();
    if (!address || typeof address === 'string') {outgoing.writeHead(503).end(); return;}
    const host = incoming.headers.host?.toLowerCase();
    const names = [options.host, 'localhost', '127.0.0.1', '[::1]'].map(name => name.includes(':') && !name.startsWith('[') ? '[' + name + ']' : name);
    if (!host || !names.some(name => host === name.toLowerCase() + ':' + address.port || address.port === 80 && host === name.toLowerCase())) {outgoing.writeHead(403).end(); return;}
    const endpoint = 'http://' + host;
    if (incoming.headers.origin && incoming.headers.origin !== endpoint) {outgoing.writeHead(403).end(); return;}
    if (incoming.url !== options.path) {outgoing.writeHead(404).end(); return;}
    const id = incoming.headers['mcp-session-id'];
    if (Array.isArray(id)) {outgoing.writeHead(400).end(); return;}
    let connection = id ? sessions.get(id) : undefined;
    if (id && !connection) {outgoing.writeHead(404).end(); return;}
    if (!connection && incoming.method !== 'POST') {outgoing.writeHead(400).end(); return;}
    if (!connection) {
      if (connections.size >= 128) {outgoing.writeHead(503).end(); return;}
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: randomUUID, enableJsonResponse: true, maxRequestBodySize: 4194304,
        onsessioninitialized: sessionId => {sessions.set(sessionId, created);},
        onsessionclosed: () => {void dispose(created);},
      });
      const created: Connection = {transport, server: binding.createServer(['2025-06-18', '2025-11-25']), touched: Date.now()};
      connection = created; connections.add(created);
      try {await created.server.connect(transport);} catch (error) {await dispose(created); throw error;}
    }
    connection.touched = Date.now();
    const controller = new AbortController(), abort = () => controller.abort();
    incoming.once('aborted', abort);
    const onClose = () => {if (!outgoing.writableEnded) abort();}; outgoing.once('close', onClose);
    try {
      const headers = new Headers();
      for (const [key, value] of Object.entries(incoming.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      const init = Object.assign({method: incoming.method ?? 'GET', headers, signal: controller.signal},
        incoming.method === 'POST' ? {body: Readable.toWeb(incoming) as never, duplex: 'half' as const} : {});
      const response = await connection.transport.handleRequest(new Request(endpoint + options.path, init));
      outgoing.writeHead(response.status, Object.fromEntries(response.headers.entries()));
      if (response.body) {
        await new Promise<void>((resolve, reject) => {
          const stream = Readable.fromWeb(response.body as never);
          stream.once('error', reject); outgoing.once('finish', resolve); outgoing.once('close', resolve);
          stream.pipe(outgoing); outgoing.once('close', () => {stream.destroy();});
        });
      } else outgoing.end();
    } finally {
      incoming.removeListener('aborted', abort); outgoing.removeListener('close', onClose);
      if (!connection.transport.sessionId) await dispose(connection);
    }
  })().catch(() => {if (!outgoing.headersSent) outgoing.writeHead(500); outgoing.end();});});
  const reaper = setInterval(() => {
    for (const connection of connections) if (Date.now() - connection.touched > 30 * 60 * 1000) void dispose(connection).catch(() => {});
  }, 60000); reaper.unref();
  const close = () => {
    stopping ??= (async () => {
      clearInterval(reaper);
      const listenerClosed = new Promise<void>(resolve => {http.close(() => resolve());});
      await Promise.allSettled([...connections].map(dispose)); http.closeAllConnections();
      try {await listenerClosed;} finally {try {await binding.close();} finally {resolveClosed();}}
    })();
    return stopping;
  };
  try {
    await new Promise<void>((resolve, reject) => {http.once('error', reject); http.listen(options.port, options.host, () => {http.removeListener('error', reject); resolve();});});
  } catch (error) {clearInterval(reaper); await binding.close(); throw error;}
  const address = http.address() as {port: number};
  return {close, closed, url: 'http://' + (options.host.includes(':') ? '[' + options.host + ']' : options.host) + ':' + address.port + options.path};
}
