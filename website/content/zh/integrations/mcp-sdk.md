# 给已有 MCP Server 添加工具

<a id="完整-sdk-server-示例"></a>

在已有服务里增加意图工具，继续使用原来的连接、工具、资源和提示词。本页以 `@modelcontextprotocol/server` 2.3.1 的 Server 为例；使用其他 SDK 时，按同样的工具列表与调用转发方式接入。只想启动服务时，直接用[独立 MCP 的 stdio / HTTP 命令](/zh/integrations/mcp)。

在现有服务项目安装运行库：

```bash
npm install @devcodex/intent-runtime
```

沿用你已有的兼容 MCP SDK，不需要为了增加工具重建服务或重复安装另一份 SDK。下面 host 模式复用客户端当前模型，不需要额外 API Key。

## 在原服务里改哪几处

1. 创建一个 Intent 实例及 adapter，声明需要提取的字段。
2. 将默认自带 intent_runtime_ 的 adapter.tools 合入原 `tools/list`，并检查最终名称是否重复。
3. 在原 `tools/call` 路由中先交给对应 session；返回 undefined 时走原工具处理器。
4. 连接关闭时释放 session；服务结束时释放 adapter 和你创建的 Intent。

下面是接入位置示意，`original.listTools / original.callTool` 指你已有的工具处理函数，**不是 SDK 新增的方法**。`server` 是原服务的 SDK Server。`attachIntentTools` 是下方完整提供的 `attach.mjs` 辅助函数；它检查合并后的名称，再创建 session。原来的 resources/prompts 处理器不用改。

```js
import {Intent} from '@devcodex/intent-runtime';
import {attachIntentTools} from './attach.mjs';

const intent = new Intent({language: 'zh-CN'});
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

将接入前的原工具处理函数映射到 original；attached 是 Promise，连接关闭时等待它解析，对成功创建的辅助对象调用 `close()`，由其释放 session/adapter；服务停止时再调用 `intent.dispose()`。不要覆盖或遗漏原关闭逻辑。若服务支持多个客户端，每个逻辑客户端保存独立 attached/session；HTTP 的端口与 transport 继续由原服务配置。

这段只说明需要改的接入位置，与完整工程复用同一份名称冲突检查和调用转接。下面的工程提供完整生命周期处理，可直接运行。JavaScript 使用 ESM `.js` 或 `.mjs`；TypeScript 使用相同 API，公共类型均由包提供。

## 与 capability-graph 等模块共存

本例的 `original.listTools()` 与转接对象的 `listTools()` 返回工具定义数组。定义包含 name 和 inputSchema，通常带 description，也可声明 outputSchema；其他模块的定义原样保留。SDK 处理器将数组放在 `tools/list` 的 `{tools: [...]}` 回复中，客户端从回复的 tools 读取定义，据此展示工具并组织调用；实际调用结果由 `tools/call` 返回。

如果现有服务已接入 capability-graph，original.listTools 就应保留其真实工具定义，original.callTool 保留其真实处理器。MCP 协议不会按模块自动隔离工具；本模块直接提供带 `intent_runtime_` 的默认名称，常规接入不必配置前缀。原有工具名称和参数沿用 capability-graph 的实际 API；**最终合并列表中的每个 name 都必须唯一**。

| 合并后的工具 | 调用处理器 |
|---|---|
| capability-graph 的实际工具名及其他原有工具 | original.callTool |
| intent_runtime_prepare | 本连接 Intent session：准备宿主候选任务 |
| intent_runtime_accept | 同一 Intent session：校验候选并返回完整结果 |
| intent_runtime_cancel | 同一 Intent session：结束该次识别交接 |

上表是分发说明；真实 `tools/list` 返回的是完整工具定义，不是仅有名称的数组。executor 模式则加入 `intent_runtime_parse`，不同时加入三个 host 工具。

同一 adapter 可包含多个 instances，调用时用 instance 选择，共享上表的一组工具。只有同一 Server 需要挂载多个 adapter 或已有工具恰好同名时，才额外设置 toolPrefix，例如 `toolPrefix: 'orders_'` 得到 `orders_intent_runtime_prepare`（accept/cancel 同理）。默认名称仍需检查冲突，重复挂载不会自动编号或覆盖原工具。

同一个 Server 为 `tools/list`、`tools/call` 各保留一个统一入口，按完整工具名分发。不要让两个模块分别重设同一个入口。仅在 Intent session 返回 `undefined` 时转发到 original；已命中的工具即使返回 `isError=true`，也保留该错误，不尝试另一个模块。

下方辅助函数在接入时、每次列工具和每次调用前，检查合并后的**全部**名称，包括原工具列表内部的重名。发现冲突会报出具体名称；修正名称或选择不冲突的前缀后再接入。动态新增工具也执行相同检查，校验发现冲突的该次调用不会进入业务工具的执行处理器。这里只合并工具和调用路由，两个模块仍按各自参数与处理器运行。

## 完整运行示例

<details>
<summary>展开两个完整文件与启动步骤</summary>

下面两个完整文件保存到同一目录，运行node server.mjs。stdout只传MCP，应用日志用stderr。客户端应能发现ping和三个默认 intent_runtime_ 意图工具；原资源、Prompt也保持可用。

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

示例是stdio；不要在同一stdout输出应用日志。宿主连接后会看到ping、intent_runtime_prepare、intent_runtime_accept、intent_runtime_cancel。识别请求使用instance=orders、fields=[orderId]，并遵循[host工具流程](/zh/integrations/codex#工具与回复)。


连接协商、生命周期和错误信封见[Adapter参考](/zh/api/mcp#adapter-api)。本例承载 stdio；已有 HTTP 服务沿用自己的监听和会话管理。

</details>
