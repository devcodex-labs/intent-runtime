---
title: Intent 与执行器
description: IntentConfig、parse、dispose、默认资源限制及自定义 ModelExecutor 的公共接口。
---

# Intent 与执行器

公共入口：

```ts
import { Intent, IntentParseError, DEFAULT_LIMITS } from "@devcodex/intent-runtime";
import type { IntentConfig, IntentParseRequest, IntentResult, ModelExecutor } from "@devcodex/intent-runtime";
```

| 公开导出 | 名称 |
| --- | --- |
| 实例与常量 | `Intent`、`ACTIONS`、`STATUSES`、`DEFAULT_LIMITS` |
| 请求与结果类型 | `IntentConfig`、`IntentLimits`、`IntentParseRequest`、`IntentResult`、`IntentItem`、`IntentAction`、`IntentStatus`、`Clarification` |
| 材料与 Schema 类型 | `ContextMessage`、`IntentContext`、`JsonValue`、`JSONSchema` |
| 执行器类型 | `ModelExecutor`、`ExecutorCapabilities`、`ModelRequest`、`ModelReply` |
| 错误类与常量 | `IntentParseError`、`IntentDataError`、`ERROR_CODES`、`DATA_ISSUE_CODES` |
| 错误类型 | `ErrorCode`、`DataIssueCode`、`ErrorStage`、`IntentIssue`、`SerializedIntentError` |

结果完整类型、字段规则和 JSON 示例见[响应结构](./response.md)，语义解释见[意图契约](../guide/intent-contract.md)，错误类型见[错误参考](./errors.md)。其他子模块的导出见 [Bridge 与 MCP](./bridge-mcp.md#公开入口)及 [API 适配器](../integrations/openai-xai.md#公开入口)。

## new Intent(config)

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `language` | `en` | BCP 47 结构化说明语言 |
| `schema` | 空对象 Schema | 业务扩展定义 |
| `executor` | 未配置 | API parse 需要执行器；Bridge/MCP 由宿主生成候选 |
| `timeoutMs` | 0 | 不增加解析总期限；高级调用方可显式设置正整数 |
| `repairAttempts` | 1 | 每阶段候选修复次数，只支持 0 或 1 |
| `limits` | `DEFAULT_LIMITS` | 可选的部分资源限制覆盖 |

Schema、language、timeoutMs、repairAttempts 和 limits 在初始化时确定；修改原配置或 Schema 不会更新实例。

自定义 `executor` 保存原对象引用：重新赋值 `config.executor` 不会替换实例使用的执行器，但修改原执行器的 `generate` 或 capabilities 会影响后续调用。构造后保持执行器行为稳定；需要更换定义或执行器时创建新 Intent 实例。

## parse(request)

```ts
interface IntentParseRequest {
  input: string;
  fields?: readonly string[];
  context?: string | readonly {
    role: "user" | "assistant" | "tool";
    content: string;
  }[];
}
// intent.parse(request): Promise<IntentResult>
```

`input` 必须包含非空白文字。`fields` 选择顶层字段；省略、部分选择与 `[]` 的行为见 [Schema 与字段选择](../guide/schema-fields.md)。`context` 是显式文字或按时间顺序排列的消息，不隐式加载宿主历史。

parse 只接受一个请求对象；请求和 context 消息中的未知参数会被拒绝。重复 fields 会去重。返回 Promise 在成功时得到完整结果，在失败时抛出 `IntentParseError` 或其子类。

未配置 executor 时，parse 抛出 `EXECUTOR_NOT_CONFIGURED`。接口没有公开的单次 parse signal 参数；自定义 executor 接收模块提供的 `ModelRequest.signal`。

## dispose()

释放实例并停止该实例上的活动流水线，活动识别和释放后的新调用均返回 `INSTANCE_DISPOSED`。重复释放可安全调用，之后需要创建新实例；生命周期见[相关指南](../guide/lifecycle.md)。

## 默认资源限制

下面列出当前全部默认值。字节限制按 UTF-8 或相应内部序列化统计，不等于字符数量；校验预算属于本地资源保护。

| limit | 默认值 |
| --- | --- |
| `maxInputBytes` | 65536 |
| `maxContextBytes` | 131072 |
| `maxSchemaBytes` | 131072 |
| `maxRequestBytes` | 524288 |
| `maxOutputBytes` | 262144 |
| `maxSchemaDepth` | 8 |
| `maxSchemaProperties` | 256 |
| `maxContextMessages` | 100 |
| `maxIntentCount` | 100 |
| `maxConcurrentParses` | 4 |
| `maxSchemaCacheEntries` | 128 |
| `maxCandidateDepth` | 32 |
| `maxCandidateNodes` | 20000 |
| `maxEvidenceEntries` | 4096 |
| `maxIssueCount` | 256 |
| `maxValidationMs` | 1000 |
| `maxValidationQueueEntries` | 32 |

通常保持默认即可。覆盖值必须为正安全整数，计时相关值另受平台计时器范围约束。

## ModelExecutor

自定义执行器需提供 `id`、四个 boolean capabilities 和异步 `generate(request)`：

```ts
interface ModelExecutor {
  readonly id: string;
  readonly capabilities: {
    nativeJsonSchema: boolean;
    nativeJsonObject: boolean;
    isolatedTurn: boolean;
    supportsAbort: boolean;
  };
  generate(request: ModelRequest): Promise<ModelReply>;
}
```

请求与回复契约：

```ts
interface ModelRequest {
  stage: "core" | "data";
  instructions: string;
  payload: string;
  format:
    | { kind: "json_schema"; name: string; schema: JSONSchema }
    | { kind: "json_object" };
  signal: AbortSignal;
}

type ModelReply =
  | { outcome: "complete"; text: string }
  | { outcome: "refusal" | "incomplete"; detail?: string };
```

必须支持 abort，按当前请求格式生成候选，不隐式执行工具或加入额外上下文。`signal` 用于停止执行器正在等待的请求，默认没有解析总期限。

返回值为 `{ outcome: "complete", text: "完整候选 JSON" }`，或 `{ outcome: "refusal" | "incomplete", detail?: string }`。声明的能力必须与实际执行器一致。内置 API 适配器见 [OpenAI 与 xAI](../integrations/openai-xai.md)。

core 和 data 的候选结构与最终 IntentResult 不同；任务 payload、候选和修复示例见 [Bridge 与 MCP：任务与候选](./bridge-mcp.md#任务与候选)。执行器将 instructions 与 payload 交给模型，按本次 format 生成完整候选；最终结果由模块验证并组装。
