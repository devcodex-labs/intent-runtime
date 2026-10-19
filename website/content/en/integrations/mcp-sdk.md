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
2. Merge adapter.tools, whose default names include intent_runtime_, into the original tools/list response and check every final name for duplicates.
3. Forward tools/call through its session; when it returns undefined, use the original handler.
4. Close the session when its connection ends; close the adapter and caller-created Intent when the service stops.

This sketch shows where to integrate. original.listTools/original.callTool are **your existing handlers, not SDK methods**. server is your existing SDK Server. attachIntentTools is the helper provided in full as attach.mjs below; it checks merged names before creating a session. Resources/prompts handlers remain unchanged.

```js
import {Intent} from '@devcodex/intent-runtime';
import {attachIntentTools} from './attach.mjs';

const intent = new Intent({language: 'en'});
let attached;
const tools = () => attached ??= attachIntentTools(
  original,
  {mode: 'host', instances: {main: intent}},
  {protocolVersion: server.getNegotiatedProtocolVersion()},
);

server.setRequestHandler('tools/list', async () => ({
  tools: await (await tools()).listTools(),
}));
server.setRequestHandler('tools/call', async (request, context) => {
  return (await tools()).callTool(
    request.params.name,
    request.params.arguments ?? {},
    {signal: context.mcpReq.signal},
  );
});
```

Map original to the handlers that existed before attachment. attached is a Promise: on connection cleanup, await it and call close() on the successfully created helper to close its session/adapter. Dispose the caller-owned Intent on service shutdown and preserve existing cleanup. Keep a separate attached helper/session for each logical client. Existing HTTP servers retain their own ports and transports.

The sketch and complete example reuse the same collision checks and call forwarding. The complete example below adds lifecycle handling. JavaScript supports ESM .js/.mjs; TypeScript uses the same API with included public types.

## Coexist with capability-graph and other modules

In this example, original.listTools() and the forwarding helper's listTools() return an array of tool definitions. Each definition has name and inputSchema, usually includes description, and may declare outputSchema; other modules' definitions remain intact. The SDK handler wraps the array in a tools/list response shaped as {tools: [...]}. Clients read definitions from the response's tools property to display tools and prepare calls. tools/call returns the actual invocation result.

If your existing server already includes capability-graph, original.listTools retains its actual definitions and original.callTool retains its actual handlers. MCP does not automatically isolate tools by module. This module supplies default names containing `intent_runtime_`, so ordinary integrations need no prefix configuration. Keep capability-graph's actual names and parameters; **every name in the final merged list must be unique**.

| Merged tool | Handler |
|---|---|
| Actual capability-graph tool names and other existing tools | original.callTool |
| intent_runtime_prepare | This connection's Intent session: prepare a host candidate task |
| intent_runtime_accept | The same Intent session: validate the candidate and return the complete result |
| intent_runtime_cancel | The same Intent session: end this recognition handoff |

This table explains routing; the actual tools/list contains full definitions, not just an array of names. Executor mode adds intent_runtime_parse instead of the three host tools.

One adapter may contain multiple instances, selected by instance, sharing the tool set above. Use an additional toolPrefix only when the same Server needs multiple adapters or already has a matching tool name. For example, `toolPrefix: 'orders_'` produces `orders_intent_runtime_prepare` (and corresponding accept/cancel names). Default names still require collision checks; repeated attachment does not automatically number tools or overwrite existing ones.

Keep one shared handler for tools/list and one for tools/call on the Server, dispatching by exact tool name. Do not let two modules replace the same handler independently. Forward to original only when the Intent session returns undefined. A matched tool's isError=true reply remains its error; do not try another module.

The helper below checks **all** merged names on attachment, on each listing and before each call, including duplicates within the original tool list. A conflict reports its name; fix the name or choose a distinct prefix before attaching again. Dynamic additions use the same checks; a call rejected by this check does not reach a business tool's execution handler. This merges tool definitions and routing; each module retains its own parameters and handlers.

<span id="完整运行示例" aria-hidden="true"></span>

## Complete runnable example

<details>
<summary>Two files and startup instructions</summary>

Save both files in one directory and run node server-en.mjs. stdout carries MCP only; application logs go to stderr. The client should discover ping and the three default intent_runtime_ tools; the existing resource and prompt remain usable.

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
    const names = new Set();
    for (const tool of [...tools, ...adapter.tools]) {
      if (names.has(tool.name)) throw new Error('Duplicate MCP tool name: ' + tool.name + '. Rename the conflicting tool or choose a non-conflicting toolPrefix.');
      names.add(tool.name);
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
  const tools = () => bridge ??= attachIntentTools(original, {mode: 'host', instances: {orders: intent}}, {protocolVersion: server.getNegotiatedProtocolVersion()});
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

This example uses stdio; do not print application logs on stdout. Connect a client and check ping, intent_runtime_prepare, intent_runtime_accept, intent_runtime_cancel. For recognition use instance=orders and fields=['orderId'], following the [host handoff](/integrations/codex#tools-and-replies).

See [Adapter reference](/api/mcp#adapter-api) for negotiation, ownership and error envelopes. An existing HTTP service keeps its listener and session management.

</details>
