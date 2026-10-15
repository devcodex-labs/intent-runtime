# 接入 MCP 与已有 tools

| 用法 | 你提供什么 | 谁管理连接 |
|---|---|---|
| 独立stdio | 可信.mjs配置 | intent-runtime-mcp |
| 已有MCP服务 | Intent实例、adapter、SDK处理器 | 你的SDK服务 |
| 远程Streamable HTTP | 将同一adapter挂到已有HTTP MCP | 你的服务管理监听、认证和逻辑session |

模型来源另行选择：executor模式暴露intent_parse；host模式暴露prepare/accept/cancel，由当前宿主生成候选。工具注册不会自动获取模型或拦截所有消息。

## 独立 stdio 服务

先按[安装与版本](/guide/installation#获取当前-v2-包)构建V2的tgz。将[完整host配置](/integrations/codex#1-保存配置)保存为可信绝对.mjs文件，然后安装并启动：

```bash
npm install -g /absolute/path/devcodex-intent-runtime-2.0.0-dev.0.tgz
intent-runtime-mcp --config /absolute/path/intent.host.config.mjs
```

这是独立服务，不需要运行setup登记Codex。由你的MCP客户端使用stdio连接该命令；配置中的instance名称和工具模式决定调用参数。

| 独立配置 | 类型 / 默认 | 规则 |
|---|---|---|
| mode | executor或host / executor | 可信服务配置，不由工具参数切换 |
| instances | Record&lt;string, IntentConfig&gt; / 必填 | 非空配置映射；CLI创建并拥有Intent |
| toolPrefix | string / 空 | 加在所有工具名前；最终名称≤128字符 |

executor实例要配置[模型执行器](/integrations/api)，host无需executor。支持--help/--version；无效参数退出2，加载/启动失败退出1，正常EOF或SIGINT/SIGTERM退出0。stdout仅传MCP，日志用stderr。

## 添加到已有 MCP tools

先按[安装与版本](/guide/installation)将V2装到已有服务项目。adapter提供工具定义和调用转接；你的MCP SDK继续管理协议、transport、原tools、resources和prompts。

```text
宿主 → 既有 MCP SDK
            ├─ tools/list：原工具 + adapter.tools
            ├─ tools/call：session.callTool → 未命中则原路由
            └─ resources / prompts：保留原处理器
```

以下是挂接片段，不是独立服务器。intent是调用方创建的Intent，negotiatedVersion来自SDK协商；existingTools和callExistingTool来自你的原服务。

```js
import {createIntentMcpAdapter} from '@devcodex/intent-runtime/mcp';

const adapter = createIntentMcpAdapter({mode: 'host', instances: {orders: intent}, toolPrefix: 'ir_'});
if (adapter.tools.some(tool => existingTools.some(old => old.name === tool.name))) {
  await adapter.close();
  throw new Error('Choose a non-conflicting toolPrefix.');
}
const session = adapter.connect({protocolVersion: negotiatedVersion});
const tools = [...existingTools, ...adapter.tools]; // return in tools/list
async function callTool(name, args, options) {
  const result = await session.callTool(name, args, options);
  return result === undefined ? callExistingTool(name, args, options) : result;
}
// Logical connection ends: await session.close().
// Service stops: await adapter.close(); await intent.dispose().
```

一个逻辑客户端保留一个session，不为每次工具调用重建。不要在未协商前猜测协议版本。可直接运行的双文件代码、SDK请求处理器和关闭流程见[完整SDK Server示例](/integrations/mcp-sdk)。

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

远程使用时，将相同listTools/callTool转接挂到你已有的Streamable HTTP SDK处理器。认证、监听和断线恢复属于服务；逻辑session仍存续时，短暂HTTP断流不等于close。独立bin没有--port或HTTP监听选项。链接的完整可运行示例是stdio，不将它的验证结果当成任意HTTP部署已经兼容。
