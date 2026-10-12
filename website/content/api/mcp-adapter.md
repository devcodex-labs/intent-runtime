---
title: MCP Adapter
description: 嵌入已有 MCP 的 SDK 无关工具声明、调用分发、两种模型模式、取消与会话接口。
---

# MCP Adapter

Adapter 在已有 MCP 服务中提供工具声明、调用分发和识别会话。宿主负责 SDK 注册、Server、transport、逻辑会话和业务执行。

:::info 版本范围
本页的 Adapter 和原生取消选项属于下一兼容版本新增接口。已发布的 npm 1.0.2 使用 [SDK](./intent.md)、[Bridge 或独立 stdio](./bridge-mcp.md)。从当前源码构建时可使用本页接口。
:::

## 公开入口与完整类型

```ts
import { createIntentMcpAdapter } from "@devcodex/intent-runtime/mcp/adapter";
import type { Intent, IntentParseOptions, JSONSchema } from "@devcodex/intent-runtime";
import type { BridgeConfig } from "@devcodex/intent-runtime/bridge";

type IntentMcpAdapterConfig =
  | (BridgeConfig & { mode?: "host"; toolPrefix?: string })
  | { mode: "executor"; instances: Record<string, Intent>; toolPrefix?: string };

interface IntentMcpToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JSONSchema & { type: "object" };
  readonly outputSchema?: JSONSchema & { type: "object" };
}

interface IntentMcpToolResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError: boolean;
}

interface IntentMcpSession {
  callTool(name: string, args: unknown, options?: IntentParseOptions): Promise<IntentMcpToolResult | undefined>;
  close(): void;
}

interface IntentMcpAdapter {
  readonly tools: readonly IntentMcpToolDefinition[];
  connect(): IntentMcpSession;
  close(): void;
}

// createIntentMcpAdapter(config: IntentMcpAdapterConfig): IntentMcpAdapter
```

这些类型全部从 adapter 子路径导出。子路径不静态加载 MCP Server SDK；不接收特定 SDK 的 Server 或 Transport 类。工具的 inputSchema 是 JSON Schema，宿主应按其 SDK 转换和注册。

## 两种模式

| 模式 | 工具 | 模型来源 | 成功 structuredContent |
| --- | --- | --- | --- |
| host（默认） | intent_prepare、intent_accept、intent_cancel | 宿主按任务生成候选 | task/result 的 BridgeReply |
| executor | intent_parse | 命名 Intent 的 ModelExecutor | 直接 IntentResult |

`intent_parse` 接收 instance/input，可选 context/fields，与 [prepare 请求](./bridge-mcp.md#工具与-session-方法)相同。它通过 Intent.parse 完成 core/data/repair，客户端一次调用获得结果。实例缺少 executor 时返回 EXECUTOR_NOT_CONFIGURED，不会借用客户端模型。

host 的三个工具完整请求与候选见 [Bridge 与 MCP](./bridge-mcp.md)。首次 task 需要宿主生成候选并调用 accept；只有 result 才是最终成功。未知实例或额外 JSON 参数返回 INPUT_INVALID，未知 fields 返回 UNKNOWN_FIELD；SDK 自身可能更早拒绝不满足 inputSchema 的参数。

## 配置参考

| 配置 | 类型、默认值 | 校验与含义 |
| --- | --- | --- |
| mode | host/executor，默认 host | 其他值 CONFIG_INVALID；null 不作为默认值 |
| instances | 非空 Record<string, Intent>，必填 | 接收已创建、未释放的同包 Intent；实例名按原样匹配，无隐式 default |
| toolPrefix | string，默认空 | 原样拼接，不自动加分隔符；仅 A–Z/a–z/0–9/下划线/点/短横线；最终工具名最多 128 字符 |
| host 容量/兼容选项 | BridgeConfig | 默认及合法范围见 [Bridge 配置](./bridge-mcp.md#配置与容量)；executor 模式不接受这些键 |

未知配置键或 null 容量/TTL 值 CONFIG_INVALID。工具声明是每个 adapter 独立的冻结快照，prepare/parse 的 instance 枚举包含实际配置的实例名。更改原配置对象不会新增实例或改变现有声明。

例如 `toolPrefix: "orders_"` 产生 `orders_intent_prepare` 或 `orders_intent_parse`；`orders_other` 不归本模块处理。同名冲突由宿主注册层检查并拒绝，使用不同前缀可以注册多个 adapter。

## tools、connect 和 callTool

`tools` 只声明选定模式的工具，默认没有 outputSchema。注册后，每个逻辑客户端会话创建一次 connect 并在后续调用中复用；不要每次 tools/call 都创建新 session。

callTool 对完整已声明名称执行分发。未知名称返回 undefined，宿主继续自己的原业务分发；所属工具失败返回 isError=true，不吞掉其他工具。

```js
import { Intent } from "@devcodex/intent-runtime";
import { createIntentMcpAdapter } from "@devcodex/intent-runtime/mcp/adapter";

const intent = new Intent({ language: "zh-CN" });
const adapter = createIntentMcpAdapter({ instances: { general: intent } });
const session = adapter.connect();
try {
  const result = await session.callTool("intent_prepare", {
    instance: "general", input: "分析这个项目，先不要修改代码。", fields: [],
  });
  if (!result) throw new Error("工具名称不归该 Adapter。");
  console.log(JSON.parse(result.content[0].text));
} finally {
  session.close(); adapter.close(); intent.dispose();
}
```

上例展示任务创建与清理，完整生成候选和消费结果见[接入示例索引](../examples/index.md)。不执行分析项目或修改代码。

## 返回、错误与 outputSchema

成功总是提供 JSON 文本与同值的 structuredContent；executor 为直接七字段结果，host 为 task/result 外层。字段定义及非空 requirements 示例见 [响应结构](./response.md)。

| 路径 | 错误 JSON 文本 | 错误 structuredContent |
| --- | --- | --- |
| 新 executor adapter | SerializedIntentError，直接含 code/stage/message/issues/partialResult | 省略 |
| 新 host adapter | 完整 kind:error、error:SerializedIntentError 的 BridgeReply | 省略 |
| 旧 serveIntentMcp/生产 stdio | 完整 BridgeReply | 保留，与旧行为一致 |

统一读取时，先检查 isError，再从 JSON 文本取得错误；成功可以使用 structuredContent。下面的读取函数可同时处理新旧错误外层：

```js
export function readIntentToolReply(result) {
  const text = result.content.find(item => item.type === "text");
  if (!text || text.type !== "text") throw new Error("缺少 JSON 文本。");
  const value = result.structuredContent ?? JSON.parse(text.text);
  return result.isError ? { ok: false, error: value.error ?? value }
    : { ok: true, value };
}
```

宿主自行声明只覆盖成功的 outputSchema 时，仍使用上述错误文本路径；返回结构化错误时 Schema 必须同时覆盖错误。isError=true 本身不会使所有 SDK 忽略已存在的 structuredContent 校验。该行为已用 SDK v1/v2 客户端验证，详见[验证说明](../testing/validation.md)。

## 取消、关闭与资源拥有权

callTool 第三个参数为 `{ signal?: AbortSignal }`，属于原生选项，不放进 JSON arguments。executor 转发给当前 parse；host accept 在 Bridge 内先验证会话、token、候选冲突，再绑定取消。同步 prepare/cancel 的已取消调用不创建新任务。

旧步骤重放不绑定新的取消；同一活动 job 的重复 accept 共用处理，任一有效等待者取消会结束该 job。步骤已提交状态后，旧信号不会取消后续步骤。其他 job 和共享 Intent 的其他调用继续。

| 操作 | 影响与关闭后行为 |
| --- | --- |
| session.close | 幂等；取消所属 parse、关闭所属 BridgeSession；所属工具之后返回 BRIDGE_JOB_NOT_FOUND，未知名称仍 undefined |
| adapter.close | 幂等；关闭自己的全部 session/Bridge；之后 connect 抛 BRIDGE_JOB_NOT_FOUND |
| 调用方 intent.dispose | 由实例拥有者执行；停止该实例全部任务，可能影响共享该实例的多个 adapter |

库不关闭调用方 Server、Transport、Intent 或 executor。取消后 Promise 收尾与监听清理通过异步流程完成，close 不承诺强杀忽略信号的外部实现。默认无任务时间 TTL；HTTP 临时断流与逻辑会话关闭见[生命周期](../guide/lifecycle.md)。
