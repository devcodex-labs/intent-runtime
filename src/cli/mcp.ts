#!/usr/bin/env node
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import {PACKAGE_VERSION} from '../internal/version.js';

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  process.stdout.write('intent-runtime-mcp --config <trusted-absolute-path.mjs>\n');
} else if (args.length === 1 && args[0] === '--version') {
  process.stdout.write(PACKAGE_VERSION + '\n');
} else if (args.length !== 2 || args[0] !== '--config' || !isAbsolute(args[1]!) || !args[1]!.endsWith('.mjs')) {
  process.stderr.write('Expected --config <trusted-absolute-path.mjs>.\n'); process.exitCode = 2;
} else {
  try {
    const [{startStdio}, configuration] = await Promise.all([import('../mcp/stdio.js'), import(pathToFileURL(args[1]!).href)]);
    const service = startStdio(configuration.default);
    const stop = () => {void service.close();};
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    await service.closed;
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
  } catch {
    process.stderr.write('Intent MCP startup failed; check the trusted configuration and installed dependencies.\n'); process.exitCode = 1;
  }
}
