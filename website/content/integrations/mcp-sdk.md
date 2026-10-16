# 给已有 MCP Server 添加工具

<a id="完整-sdk-server-示例"></a>

在已有服务里增加意图工具，继续使用原来的连接、工具、资源和提示词。本页以 `@modelcontextprotocol/server` 2.3.1 的 Server 为例；使用其他 SDK 时，按同样的工具列表与调用转发方式接入。只想启动服务时，直接用[独立 MCP 的 stdio / HTTP 命令](/integrations/mcp)。

在现有服务项目安装运行库：

```bash
npm install @devcodex/intent-runtime
```

沿用你已有的兼容 MCP SDK，不需要为了增加工具重建服务或重复安装另一份 SDK。下面 host 模式复用客户端当前模型，不需要额外 API Key。

## 在原服务里改哪几处

1. 创建一个 Intent 实例及 adapter，声明需要提取的字段。
2. 在原 `tools/list` 回复中加入 adapter.tools。
3. 在原 `tools/call` 路由中先交给对应 session；返回 undefined 时走原工具处理器。
4. 连接关闭时释放 session；服务结束时释放 adapter 和你创建的 Intent。

下面是接入位置示意，`original.listTools / original.callTool` 指你已有的工具处理函数，**不是 SDK 新增的方法**。`server` 是原服务的 SDK Server。原来的 resources/prompts 处理器不用改。

```js
import {Intent} from '@devcodex/intent-runtime';
import {createIntentMcpAdapter} from '@devcodex/intent-runtime/mcp';

const intent = new Intent({language: 'zh-CN'});
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

将原工具处理函数映射到 original；在现有关闭流程中调用 `session?.close()`，服务停止时再调用 `adapter.close()` 和 `intent.dispose()`。不要覆盖或遗漏原关闭逻辑。工具名称冲突时设置 `toolPrefix`。若服务支持多个客户端，每个逻辑客户端保存独立 session；HTTP 的端口与 transport 继续由原服务配置。

这段只说明需要改的接入位置。下面的完整工程提供名称冲突检查、生命周期处理和原有功能验证，可直接运行。JavaScript 使用 ESM `.js` 或 `.mjs`；TypeScript 使用相同 API，公共类型均由包提供。

## 完整运行示例

<details>
<summary>展开两个完整文件与启动步骤</summary>

下面两个完整文件保存到同一目录，运行node server.mjs。stdout只传MCP，应用日志用stderr。客户端应能发现ping和三个ir_前缀意图工具；原资源、Prompt也保持可用。

| 文件或资源 | 职责 |
|---|---|
| attach.mjs | 合并工具列表；未命中的调用交回原路由；管理本次 Adapter/session |
| server.mjs | 用 SDK 协商协议并承载 stdio；创建 Intent；保留原 tools/resources/prompts |
| 宿主模型 | prepare 后按任务生成候选，调用 accept；服务端不另调 API |

请求路径为“客户端 → SDK → 对应逻辑 session → 识别核心”。连接结束时关闭 session/Adapter，进程结束时再 dispose 调用方拥有的 Intent；不要为 prepare 和 accept 分别创建新 session。

### 完整转接函数

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


连接协商、生命周期和错误信封见[Adapter参考](/api/mcp#adapter-api)。本例承载 stdio；已有 HTTP 服务沿用自己的监听和会话管理。

</details>
