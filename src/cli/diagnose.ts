import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import type { IntentMcpMode } from '../mcp/index.js';
import { MCP_TOOL_NAMES_BY_MODE } from '../mcp/tool-names.js';
import {PACKAGE_VERSION} from '../internal/version.js';

export async function diagnose(command: string, args: string[]): Promise<IntentMcpMode> {
  const transport = new StdioClientTransport({command, args, stderr: 'pipe', env: Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined))});
  const client = new Client({name: 'intent-runtime-diagnostic', version: PACKAGE_VERSION});
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stopped = new Promise<never>((_, reject) => {timer = setTimeout(() => {reject(new Error('Diagnostic startup failed')); void client.close();}, 10000);});
  const work = (async () => {
    transport.stderr?.on('data', () => {}); await client.connect(transport);
    const {tools} = await client.listTools({}, {timeout: 10000});
    for (const mode of ['executor', 'host'] as const) {
      const names = MCP_TOOL_NAMES_BY_MODE[mode];
      if (tools.length === names.length && names.every(suffix => tools.some(t => t.name.endsWith(suffix)))) return mode;
    }
    throw new Error('Unexpected tool definitions');
  })();
  try {return await Promise.race([work, stopped]);} finally {clearTimeout(timer); await client.close();}
}
