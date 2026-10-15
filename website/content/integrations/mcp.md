# 接入 MCP 与已有 tools

| 用法 | 你提供什么 | 谁管理连接 |
|---|---|---|
| 独立stdio | 可信.mjs配置 | intent-runtime-mcp |
| 已有MCP服务 | Intent实例、adapter、SDK处理器 | 你的SDK服务 |
| 远程Streamable HTTP | 将同一adapter挂到已有HTTP MCP | 你的服务管理监听、认证和逻辑session |

模型来源另行选择：executor模式暴露intent_parse；host模式暴露prepare/accept/cancel，由当前宿主生成候选。工具注册不会自动获取模型或拦截所有消息。

## 独立 stdio 服务

使用[Codex页的完整host配置](/integrations/codex)，保存为可信绝对.mjs文件：

```bash
intent-runtime-mcp --config /absolute/path/intent.host.config.mjs
```

| 独立配置 | 类型 / 默认 | 规则 |
|---|---|---|
| mode | executor或host / executor | 可信服务配置，不由工具参数切换 |
| instances | Record&lt;string, IntentConfig&gt; / 必填 | 非空配置映射；CLI创建并拥有Intent |
| toolPrefix | string / 空 | 加在所有工具名前；最终名称≤128字符 |

executor实例要配置[模型执行器](/integrations/api)，host无需executor。支持--help/--version；无效参数退出2，加载/启动失败退出1，正常EOF或SIGINT/SIGTERM退出0。stdout仅传MCP，日志用stderr。

## 添加到已有 MCP tools

安装V2模块和示例使用的SDK：

```bash
npm install @devcodex/intent-runtime schema-dsl@3.0.4 @modelcontextprotocol/server@2.3.1
```

完整示例有两个文件：attach.mjs负责合并tools，server.mjs把处理器接到SDK。直接复制下面两个完整代码块，保存到已安装依赖的项目同一目录，运行 `node server.mjs`；这是host模式，不需要额外API Key。原ping工具、资源和Prompt继续由原路由处理。

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

## Adapter API

```ts
createIntentMcpAdapter(config: IntentMcpAdapterConfig): IntentMcpAdapter
adapter.tools: readonly IntentMcpToolDefinition[]
adapter.connect(options: IntentMcpConnectOptions): IntentMcpSession
adapter.close(): Promise<void>
session.callTool(name: string, args: unknown, options?: IntentParseOptions): Promise<IntentMcpToolResult | undefined>
session.close(): Promise<void>
```

| 参数 | 类型 / 默认 | 行为 |
|---|---|---|
| config.mode | executor或host / executor | executor要求每实例已有执行器 |
| config.instances | Record&lt;string, Intent&gt; / 必填 | 非空、调用方创建的实例；不是独立服务的配置对象 |
| config.toolPrefix | string / 空 | 避免覆盖原工具；注册前检查同名冲突 |
| connect.protocolVersion | 声明版本 / 必填 | 由SDK协商结果提供，不能取自input/context |
| callTool.args.instance | string / 单实例自动选择 | 多实例必须明确指定；不猜default |
| callTool.options.signal | AbortSignal / 可省略 | 协议层取消，不放进工具JSON |

实例名为1～64字符 `[A-Za-z0-9_.-]`，禁止__proto__/prototype/constructor；前缀同字符集，可空。非法连接配置报CONFIG_INVALID/transport。已dispose实例不可用于新的识别。

未知tool精确返回undefined，交原路由。session.close结束所属识别和保留记录；adapter.close关闭自有sessions。二者不dispose调用方Intent，不关闭外部SDK、transport或共享模型。逻辑连接结束时再close，不为host的每个工具调用重建session；多客户端/租户不要共用一个session。

## intent_parse

executor模式只暴露intent_parse。输入为Native的input、fields、context、baseline、referenceTime、output，加instance。默认值和错误见[Native参考](/api/intent)。schema、executor、apiKey、signal、配置路径与mode不能由MCP调用者传入。

host的三个工具请求/回复见[Codex工具参考](/integrations/codex#工具与回复)，完整类型见[类型参考](/api/types)。

## 成功与错误信封

| 场景 | isError | structuredContent | content文本 |
|---|---|---|---|
| 完整/partial意图、缺字段、歧义 | false | IntentResult | 同一JSON |
| host prepare | false | HostTask | 同一JSON |
| host cancel | false | HostCancelReply | 同一JSON |
| 技术失败 | true | 省略 | `{error: SerializedIntentError}`的JSON字符串 |

技术错误不返回partialResult。未知标准方法/不合法JSON-RPC由SDK按协议处理，不伪造IntentResult。

## 协议与远程调用

支持目标为2025-06-18、2025-11-25、2026-07-28；前两版成功信封为content/structuredContent/isError，2026工具回复额外含resultType=complete。协商、discover和请求信封由匹配的SDK处理，不靠改工具参数选择协议。

远程使用时，将相同listTools/callTool转接挂到你已有的Streamable HTTP SDK处理器。认证、监听和断线恢复属于服务；逻辑session仍存续时，短暂HTTP断流不等于close。独立bin没有--port或HTTP监听选项。本文完整可运行示例是stdio，不将它的验证结果当成任意HTTP部署已经兼容。
