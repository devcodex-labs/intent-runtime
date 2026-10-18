<span id="给已有-mcp-server-添加工具" aria-hidden="true"></span>

# Extend an MCP server

Add intent tools while keeping the existing connection, tools, resources, and prompts. This page uses Server from @modelcontextprotocol/server 2.3.1. Other SDKs can use the same tool-list and call forwarding. For a standalone service, use the [stdio / HTTP commands](/integrations/mcp).

Install into the existing server project:

```bash
npm install @devcodex/intent-runtime
```

Keep your existing compatible MCP SDK; adding tools does not require rebuilding the service or installing a duplicate SDK. Host mode below reuses the client's current model without another API key.

<span id="在原服务里改哪几处" aria-hidden="true"></span>
<span id="完整-sdk-server-示例" aria-hidden="true"></span>

## Four integration points

1. Create an Intent and adapter; declare fields if needed.
2. Include adapter.tools in your original tools/list response.
3. Forward tools/call through its session; when it returns undefined, use the original handler.
4. Close the session when its connection ends; close the adapter and caller-created Intent when the service stops.

This sketch shows where to integrate. original.listTools/original.callTool are **your existing handlers, not SDK methods**. server is your existing SDK Server. Resources/prompts handlers remain unchanged.

```js
import {Intent} from '@devcodex/intent-runtime';
import {createIntentMcpAdapter} from '@devcodex/intent-runtime/mcp';

const intent = new Intent({language: 'en'});
const adapter = createIntentMcpAdapter({mode: 'host', instances: {main: intent}});
let session;

server.setRequestHandler('tools/list', async () => ({
  tools: [...await original.listTools(), ...adapter.tools],
}));
server.setRequestHandler('tools/call', async (request, context) => {
  session ??= adapter.connect({protocolVersion: server.getNegotiatedProtocolVersion()});
  const result = await session.callTool(
    request.params.name,
    request.params.arguments ?? {},
    {signal: context.mcpReq.signal},
  );
  return result ?? original.callTool(request.params.name, request.params.arguments ?? {});
});
```

Map original to your handlers. Add session?.close() to connection cleanup; call adapter.close() and intent.dispose() on service shutdown without losing existing cleanup. Use toolPrefix to avoid collisions. Keep a separate session for each logical client. Existing HTTP servers retain their own ports and transports.

The complete example below adds collision checks, lifecycle handling, and preservation of original capabilities. JavaScript supports ESM .js/.mjs; TypeScript uses the same API with included public types.

<span id="完整运行示例" aria-hidden="true"></span>

## Complete runnable example

<details>
<summary>Two files and startup instructions</summary>

Save both files in one directory and run node server-en.mjs. stdout carries MCP only; application logs go to stderr. The client should discover ping and the three ir_ intent tools; the existing resource and prompt remain usable.

| File or resource | Responsibility |
|---|---|
| attach.mjs | Merge tools; route unmatched calls back; own this adapter/session |
| server-en.mjs | SDK negotiation and stdio; create Intent; retain tools/resources/prompts |
| Client model | Generate a candidate after prepare and submit accept; no extra server-side API |

Requests follow client → SDK → logical session → core. Close session/adapter with the connection and dispose caller-owned Intent at process end. Do not create separate sessions for prepare and accept.

<span id="完整转接函数" aria-hidden="true"></span>

### Complete forwarding helper

<!-- example: examples/mcp/attach.mjs -->
```js
import {createIntentMcpAdapter} from '@devcodex/intent-runtime/mcp';

// The existing SDK owns negotiation, standard transport, resources and prompts.
// Pass a verified protocol version and retain one session per logical client.
export async function attachIntentTools(original, config, connection) {
  const adapter = createIntentMcpAdapter(config);
  const check = async () => {
    const tools = await original.listTools();
    const names = new Set(tools.map(tool => tool.name));
    if (adapter.tools.some(tool => names.has(tool.name))) {
      throw new Error('Choose a non-conflicting toolPrefix.');
    }
    return tools;
  };
  try {
    await check();
    const session = adapter.connect(connection);
    return {
      async listTools() {return [...await check(), ...adapter.tools];},
      async callTool(name, args, options) {
        await check();
        const own = await session.callTool(name, args, options);
        return own === undefined ? original.callTool(name, args, options) : own;
      },
      async close() {try {await session.close();} finally {await adapter.close();}},
    };
  } catch (error) {await adapter.close(); throw error;}
}
```

<span id="sdk-挂接" aria-hidden="true"></span>

### SDK attachment

<!-- example: examples/mcp/server-en.mjs -->
```js
import {Server, ProtocolError} from '@modelcontextprotocol/server';
import {serveStdio, StdioServerTransport} from '@modelcontextprotocol/server/stdio';
import {Intent} from '@devcodex/intent-runtime';
import {attachIntentTools} from './attach.mjs';

// A complete host-mode example: no additional model API credentials.
const intent = new Intent({language: 'en', schema: {
  type: 'object', properties: {orderId: {type: 'string', description: 'An explicit order ID; preserve leading zeros'}},
}});
const transport = new StdioServerTransport();
const attached = new Set();
const handle = serveStdio(() => {
  const server = new Server({name: 'intent-tools-example', version: '1.0.0'}, {
    capabilities: {tools: {}, resources: {}, prompts: {}},
    supportedProtocolVersions: ['2025-06-18', '2025-11-25', '2026-07-28'],
  });
  const original = {
    async listTools() {return [{name: 'ping', description: 'Return pong.', inputSchema: {type: 'object', properties: {}, additionalProperties: false}, outputSchema: {type: 'object', properties: {message: {type: 'string'}}, required: ['message']}}];},
    async callTool(name) {
      if (name !== 'ping') throw new ProtocolError(-32602, 'Unknown tool');
      const data = {message: 'pong'};
      return {...(server.getNegotiatedProtocolVersion() === '2026-07-28' ? {resultType: 'complete'} : {}), isError: false, content: [{type: 'text', text: JSON.stringify(data)}], structuredContent: data};
    },
  };
  let bridge;
  // Created after protocol negotiation, once for this logical SDK connection.
  const tools = () => bridge ??= attachIntentTools(original, {mode: 'host', instances: {orders: intent}, toolPrefix: 'ir_'}, {protocolVersion: server.getNegotiatedProtocolVersion()});
  server.setRequestHandler('tools/list', async () => ({tools: await (await tools()).listTools()}));
  server.setRequestHandler('tools/call', async (request, context) => (await tools()).callTool(request.params.name, request.params.arguments ?? {}, {signal: context.mcpReq.signal}));
  server.setRequestHandler('resources/list', async () => ({resources: [{uri: 'note://welcome', name: 'welcome', mimeType: 'text/plain'}]}));
  server.setRequestHandler('resources/read', async request => {
    if (request.params.uri !== 'note://welcome') throw new ProtocolError(-32602, 'Unknown resource');
    return {contents: [{uri: 'note://welcome', mimeType: 'text/plain', text: 'Existing resource'}]};
  });
  server.setRequestHandler('prompts/list', async () => ({prompts: [{name: 'welcome', description: 'Existing prompt'}]}));
  server.setRequestHandler('prompts/get', async request => {
    if (request.params.name !== 'welcome') throw new ProtocolError(-32602, 'Unknown prompt');
    return {messages: [{role: 'user', content: {type: 'text', text: 'Hello'}}]};
  });
  const close = async () => {if (bridge) await (await bridge).close();};
  attached.add(close);
  server.onclose = () => {attached.delete(close); void close();};
  return server;
}, {transport, onerror: () => process.stderr.write('MCP example transport failed.\n')});

let stopping;
function close() {
  stopping ??= (async () => {try {await handle.close();} finally {await Promise.all([...attached].map(fn => fn())); await intent.dispose();}})();
  return stopping;
}
const sdkClose = transport.onclose;
transport.onclose = () => {sdkClose?.(); void close();};
process.once('SIGINT', () => {void close();});
process.once('SIGTERM', () => {void close();});
```

This example uses stdio; do not print application logs on stdout. Connect a client and check ping, ir_intent_prepare, ir_intent_accept, ir_intent_cancel. For recognition use instance=orders and fields=['orderId'], following the [host handoff](/integrations/codex#tools-and-replies).

See [Adapter reference](/api/mcp#adapter-api) for negotiation, ownership and error envelopes. An existing HTTP service keeps its listener and session management.

</details>
