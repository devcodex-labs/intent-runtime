---
title: Intent 与执行器
description: IntentConfig、parse、dispose、默认资源限制及自定义 ModelExecutor 的公共接口。
---

# Intent 与执行器

公共入口：

```ts
import { Intent, IntentParseError, DEFAULT_LIMITS } from "@devcodex-labs/intent-runtime";
import type { IntentConfig, IntentParseRequest, IntentResult, ModelExecutor } from "@devcodex-labs/intent-runtime";
```

## new Intent(config)

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `language` | `en` | BCP 47 结构化说明语言 |
| `schema` | 空对象 Schema | 业务扩展定义 |
| `executor` | 未配置 | API parse 需要执行器；Bridge/MCP 由宿主生成候选 |
| `timeoutMs` | 0 | 不增加解析总期限；高级调用方可显式设置正整数 |
| `repairAttempts` | 1 | 每阶段候选修复次数，只支持 0 或 1 |
| `limits` | `DEFAULT_LIMITS` | 可选的部分资源限制覆盖 |

配置和 Schema 在实例初始化时形成内部快照，修改原对象不是更新实例配置的方式。重新构造实例来应用新定义。

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

未配置 executor 时，parse 抛出 `EXECUTOR_NOT_CONFIGURED`。接口没有公开的单次 parse signal 参数；自定义 executor 接收模块提供的 `ModelRequest.signal`。

## dispose()

释放实例并取消该实例上的活动流水线。重复释放可安全调用，之后不能再使用该实例进行识别；生命周期见[相关指南](../guide/lifecycle.md)。

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

`ModelRequest` 包含 stage、instructions、payload、format 和 signal。格式为 `json_schema`（name/schema）或 `json_object`。必须支持 abort，按当前请求格式生成候选，不隐式执行工具或加入额外上下文。

返回值为 `{ outcome: "complete", text: "完整候选 JSON" }`，或 `{ outcome: "refusal" | "incomplete", detail?: string }`。声明的能力必须与实际执行器一致。内置 API 适配器见 [OpenAI 与 xAI](../integrations/openai-xai.md)。
