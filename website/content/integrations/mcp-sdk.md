# 完整 SDK Server 示例

这是添加到已有MCP服务的进阶示例。普通使用先读[独立服务与最小挂接](/integrations/mcp)。本例使用真实@modelcontextprotocol/server@2.3.1 SDK，host模式由当前模型生成候选，不需要额外API Key。

先按[安装与版本](/guide/installation)在应用项目安装V2与schema-dsl@3.0.4，再安装SDK：

```bash
npm install @modelcontextprotocol/server@2.3.1
```

下面两个完整文件保存到同一目录，运行node server.mjs。stdout只传MCP，应用日志用stderr。客户端应能发现ping和三个ir_前缀意图工具；原资源、Prompt也保持可用。

### 完整转接函数

<!-- example: examples/mcp/attach.mjs -->
```js
import {createIntentMcpAdapter} from '@devcodex/intent-runtime/mcp';

// The existing SDK owns negotiation, standard transport, resources and prompts.
// Pass a verified protocol version and retain one session per logical client.
export async function attachIntentTools(original, config, connection) {
  const adapter = createIntentMcpAdapter(config);
  const check = async () => {const tools = await original.listTools(); const names = new Set(tools.map(t => t.name)); if (adapter.tools.some(t => names.has(t.name))) throw new Error('Choose a non-conflicting toolPrefix.'); return tools;};
  try {
    await check(); const session = adapter.connect(connection);
    return {
      async listTools() {return [...await check(), ...adapter.tools];},
      async callTool(name, args, options) {await check(); const own = await session.callTool(name, args, options); return own === undefined ? original.callTool(name, args, options) : own;},
      async close() {try {await session.close();} finally {await adapter.close();}},
    };
  } catch (error) {await adapter.close(); throw error;}
}
```

### SDK 挂接

<!-- example: examples/mcp/server.mjs -->
```js
import {Server, ProtocolError} from '@modelcontextprotocol/server';
import {serveStdio, StdioServerTransport} from '@modelcontextprotocol/server/stdio';
import {Intent} from '@devcodex/intent-runtime';
import {attachIntentTools} from './attach.mjs';

// A complete host-mode example: no additional model API credentials.
const intent = new Intent({language: 'zh-CN', schema: {
  type: 'object', properties: {orderId: {type: 'string', description: '明确订单编号，保留前导零'}},
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

示例是stdio；不要在同一stdout输出应用日志。宿主连接后会看到ping、ir_intent_prepare、ir_intent_accept、ir_intent_cancel。识别请求使用instance=orders、fields=[orderId]，并遵循[host工具流程](/integrations/codex#工具与回复)。


连接协商、生命周期和错误信封见[Adapter参考](/integrations/mcp#adapter-api)。本例验证stdio接法，不证明任意远程HTTP部署已经兼容。
