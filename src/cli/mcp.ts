#!/usr/bin/env node
import {isConfigurationPath} from './configuration.js';
import { pathToFileURL } from 'node:url';
import {PACKAGE_VERSION} from '../internal/version.js';
import {publicOrigin} from '../mcp/http-origin.js';

const args = process.argv.slice(2);
const usage = 'intent-runtime-mcp --config <trusted-absolute-path.js|.mjs> [--transport stdio|http] [--host 127.0.0.1] [--port 3001] [--path /mcp] [--public-origin https://mcp.example.com]\n';
if (args.length === 1 && args[0] === '--help') {
  process.stdout.write(usage);
} else if (args.length === 1 && args[0] === '--version') {
  process.stdout.write(PACKAGE_VERSION + '\n');
} else {
  const values = new Map<string, string>(); let invalid = false;
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]!, value = args[i + 1];
    if (!['--config', '--transport', '--host', '--port', '--path', '--public-origin'].includes(key) || values.has(key) || value === undefined || value.startsWith('--')) {invalid = true; break;}
    values.set(key, value);
  }
  const transport = values.get('--transport') ?? 'stdio', host = values.get('--host') ?? '127.0.0.1';
  const rawPort = values.get('--port') ?? '3001', port = Number(rawPort), endpoint = values.get('--path') ?? '/mcp';
  let origin: URL | undefined;
  try {origin = publicOrigin(values.get('--public-origin'));} catch {invalid = true;}
  if (!isConfigurationPath(values.get('--config')) || !['stdio', 'http'].includes(transport) || !host.trim() || /[\s/\\?#]/.test(host) || !/^\d+$/.test(rawPort) || !Number.isInteger(port) || port < 1 || port > 65535 || !/^\/[A-Za-z0-9/_-]*$/.test(endpoint) || ['0.0.0.0','::'].includes(host) && !origin || transport === 'stdio' && ['--host', '--port', '--path','--public-origin'].some(key => values.has(key))) invalid = true;
  if (invalid) {process.stderr.write(usage); process.exitCode = 2;}
  else {
  try {
    const configuration = await import(pathToFileURL(values.get('--config')!).href);
    const service = transport === 'http'
      ? await (await import('../mcp/http.js')).startHttp(configuration.default, {host, port, path: endpoint, ...(origin ? {publicOrigin:origin.origin} : {})})
      : (await import('../mcp/stdio.js')).startStdio(configuration.default);
    if ('url' in service) process.stderr.write('Intent MCP listening at ' + service.url + '\n');
    if (origin) process.stderr.write('Public MCP endpoint: ' + origin.origin + endpoint + '\n');
    const stop = () => {void service.close();};
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    await service.closed;
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
  } catch {
    process.stderr.write('Intent MCP startup failed; check the trusted configuration and installed dependencies.\n'); process.exitCode = 1;
  }
  }
}
