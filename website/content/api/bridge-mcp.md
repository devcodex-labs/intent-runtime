---
title: Bridge 与 MCP
description: BridgeSession、任务交接、重放语义和 intent_prepare、intent_accept、intent_cancel 三个 MCP 工具。
---

# Bridge 与 MCP

Bridge 管理宿主协作的识别任务，宿主负责生成候选。MCP 把该流程暴露为三个工具。

## 公开入口

| 子模块 | 函数、常量与类型 |
| --- | --- |
| `@devcodex/intent-runtime/bridge` | `createIntentBridge`；类型 `BridgeConfig`、`BridgeSession`、`BridgeReply`、`PrepareRequest`、`AcceptRequest`、`CancelRequest` |
| `@devcodex/intent-runtime/mcp` | `serveIntentMcp`、`MCP_TOOLS` |

`MCP_TOOLS` 是三个工具的声明集合，包含名称、描述和 inputSchema。需要嵌入宿主时可以读取这些声明，任务执行仍由 Bridge/MCP 服务完成。

## 完整 Bridge 流程

下面的函数完成 prepare/accept 循环，收到 result 或 error 后停止，并在 finally 关闭它创建的 session。`generateCandidate(task)` 由宿主提供，必须按实际 task 的 instructions、payload、format 生成完整 JSON 字符串；它不是模块内置的模型客户端。需要在提交被拒绝后继续原任务的宿主，按[调用错误与任务状态](#调用错误与任务状态)处理，不能仅凭 kind:error 判断任务已终止。

```js
import { Intent } from "@devcodex/intent-runtime";
import { createIntentBridge } from "@devcodex/intent-runtime/bridge";

export async function recognizeWithHost(input, generateCandidate) {
  const intent = new Intent({ language: "zh-CN" });
  const bridge = createIntentBridge({ instances: { default: intent } });
  const session = bridge.connect();
  try {
    let reply = session.prepare({ instance: "default", input, fields: [] });
    while (reply.kind === "task") {
      let candidateText;
      try {
        candidateText = await generateCandidate(reply);
      } catch (error) {
        session.cancel({ jobId: reply.jobId, outcome: "cancelled" });
        throw error;
      }
      reply = await session.accept({
        jobId: reply.jobId,
        stepToken: reply.stepToken,
        candidateText,
      });
    }
    return reply;
  } finally {
    session.close();
    bridge.close();
    intent.dispose();
  }
}
```

例子使用 fields=[]，只识别默认意图。业务字段实例需要提供 Schema 并调整 fields；同一循环也处理 data 和修复任务。若宿主明确拒绝或未生成完整候选，应按下文使用 refusal/incomplete 取消，而不是提交空字符串。

每次 `connect()` 产生独立的任务归属，不能跨连接使用 jobId 和 stepToken。`createIntentBridge(config)` 返回 `{ connect(): BridgeSession, close(): void }`；关闭 Bridge 不释放调用方传入的 Intent。

## 配置与容量

```ts
interface BridgeConfig {
  instances: Record<string, Intent>;
  maxJobs?: number;
  maxReplayEntries?: number;
  maxReplayBytes?: number;
  /** @deprecated */ jobTtlMs?: number;
  /** @deprecated */ replayTtlMs?: number;
}
```

| 选项 | 默认值 |
| --- | --- |
| `instances` | 必填，非空的命名 Intent 实例集合 |
| `maxJobs` | 32 个活动任务 |
| `maxReplayEntries` | 128 个保留任务记录，包括活动及终态任务 |
| `maxReplayBytes` | 8388608 字节 |

已弃用的兼容选项 `jobTtlMs` 与 `replayTtlMs` 默认均为 0，无时间 TTL。正常使用无需设置。

以上容量在同一个 Bridge 的全部 session 与命名实例之间共享。`maxJobs` 统计尚未终态的任务；`maxReplayEntries` 按 job 记录数统计，不按 stepToken 或回复条数统计。

`maxReplayBytes` 统计保留记录的内部序列化内容，包括任务材料、core 结果、修复材料、终态与步骤回复，按 UTF-8 字节累计。它不是最终 result 的大小限制。容量不足时优先回收已终态记录，不回收活动任务来接纳新任务；单次候选超预算时保留活动 job 和当前 token，返回 `LIMIT_EXCEEDED`。

容量选项必须为不超过 2147483647 的正安全整数。旧兼容 TTL 可为 0，且受同一计时器范围约束。

## 工具与 session 方法

| MCP 工具 | Bridge 方法 | 参数 |
| --- | --- | --- |
| `intent_prepare` | `session.prepare()` | `instance`、`input`；可选 `fields`、`context` |
| `intent_accept` | `await session.accept()` | `jobId`、`stepToken`、完整字符串 `candidateText` |
| `intent_cancel` | `session.cancel()` | `jobId`；可选 `outcome`、`detail` |

完整请求类型如下。context 的消息角色和 fields 的选择规则见 [parse 请求](./intent.md#parserequest)。

```ts
import type { IntentParseRequest } from "@devcodex/intent-runtime";

interface PrepareRequest extends IntentParseRequest {
  instance: string;
}
interface AcceptRequest {
  jobId: string;
  stepToken: string;
  candidateText: string;
}
interface CancelRequest {
  jobId: string;
  outcome?: "cancelled" | "refusal" | "incomplete";
  detail?: string;
}
interface BridgeSession {
  prepare(request: PrepareRequest): BridgeReply;
  accept(request: AcceptRequest): Promise<BridgeReply>;
  cancel(request: CancelRequest): BridgeReply;
  close(): void;
}
```

取消 outcome 为 `cancelled`、`refusal`、`incomplete`，默认 cancelled。detail 最多 **2048 UTF-8 字节**；例如 682 个“中”为 2046 字节，683 个为 2049 字节，会被拒绝。

活动任务取消分别返回 `MODEL_ABORTED`、`MODEL_REFUSED`、`MODEL_OUTPUT_INCOMPLETE`。已终态且仍保留的任务在参数有效时返回原终态，可能仍是 result；任务被回收后返回 `BRIDGE_JOB_NOT_FOUND`。MCP 的 isError 为 true 不意味着取消失败。

## 回复类型

| kind | 内容 |
| --- | --- |
| `task` | jobId、stepToken、stage、instructions、payload、format；默认没有 expiresAt |
| `result` | 完整公共 [IntentResult](./response.md) |
| `error` | 可序列化的 [error](./errors.md)，含 code、stage、message、issues 和可选 partialResult |

```ts
import type { IntentResult, ModelRequest, SerializedIntentError } from "@devcodex/intent-runtime";

type BridgeReply =
  | {
      kind: "task";
      jobId: string;
      stepToken: string;
      stage: "core" | "data";
      instructions: string;
      payload: string;
      format: ModelRequest["format"];
      expiresAt?: string;
    }
  | { kind: "result"; result: IntentResult }
  | { kind: "error"; error: SerializedIntentError };
```

task 的 payload 是 JSON 字符串；format.schema（存在时）是 JSON 对象。提交的 candidateText 是完整候选 JSON 字符串。默认没有 expiresAt；仅显式启用旧兼容 jobTtlMs 时返回 ISO 时间字符串。

下面展示 data task 的完整字段层级。jobId、stepToken、instructions 和 payload 取决于实际任务；示例令牌只用于阅读，instructions 的示意文字不可替代真实任务指令。core task 的 format 为 `{ kind: "json_schema", name: "intent_core", schema: ... }`，完整 schema 由每次 task 提供。

<!-- bridge-reply: task -->
```json
{
  "kind": "task",
  "jobId": "<实际 jobId>",
  "stepToken": "<实际 stepToken>",
  "stage": "data",
  "instructions": "<本次任务的完整指令>",
  "payload": "{\"structuredLanguage\":\"zh-CN\",\"currentInput\":\"查询订单 000123\",\"context\":[],\"schemaReference\":{\"type\":\"object\",\"properties\":{\"orderId\":{\"type\":\"string\",\"description\":\"当前请求中的订单编号，保留前导零。\"}},\"required\":[\"orderId\"],\"additionalProperties\":false},\"checkedDefault\":{\"input\":\"查询订单 000123\",\"normalizedInput\":\"查询订单 000123。\",\"primaryIntent\":\"查询订单 000123\",\"requirements\":[],\"intents\":[{\"id\":\"i1\",\"action\":\"query\",\"target\":\"订单 000123\",\"requirements\":[],\"status\":\"ready\"}],\"prohibitions\":[],\"data\":{}},\"selectedSchema\":{\"type\":\"object\",\"properties\":{\"orderId\":{\"type\":\"string\",\"description\":\"当前请求中的订单编号，保留前导零。\"}},\"required\":[\"orderId\"],\"additionalProperties\":false},\"selectedFields\":[\"orderId\"]}",
  "format": { "kind": "json_object" }
}
```

<!-- bridge-reply: result -->
```json
{
  "kind": "result",
  "result": {
    "input": "查询订单 000123",
    "normalizedInput": "查询订单 000123。",
    "primaryIntent": "查询订单 000123",
    "requirements": [],
    "intents": [
      { "id": "i1", "action": "query", "target": "订单 000123", "requirements": [], "status": "ready" }
    ],
    "prohibitions": [],
    "data": { "orderId": "000123" }
  }
}
```

<!-- bridge-reply: error -->
```json
{
  "kind": "error",
  "error": {
    "code": "INPUT_INVALID",
    "stage": "input",
    "message": "input must contain non-whitespace text.",
    "issues": []
  }
}
```

收到 task 后结束当前工具调用，再生成候选；如果下一次回复仍为 task，继续处理。使用每次实际回复的令牌，不从文档示例编造。result 表示成功；error 的处理见下一节。

## 调用错误与任务状态

`kind: "error"` 表示本次调用失败。部分提交拒绝会保留活动任务和有效 stepToken，不能将所有 error 都理解为任务已经终止。MCP 的 `isError: true` 也只描述此次工具回复。

| 发生位置 / 情况 | 对任务的影响 | 宿主处理 |
| --- | --- | --- |
| prepare 输入或实例无效、容量不足 | 未为该请求创建可继续的 job | 修正请求后重新 prepare |
| 活动 job 的 accept 参数类型或未知参数错误 | 不推进该 job | 修正参数，使用最后实际 task 的有效令牌 |
| 候选超过 maxOutputBytes 或提交无法纳入保留字节容量 | 返回 LIMIT_EXCEEDED，活动 job 与当前令牌保持 | 调整候选；仍使用原有效令牌，不能改写用户材料来规避限制 |
| token 伪造、同 token 不同候选或竞争提交 | 返回 BRIDGE_STEP_CONFLICT，不替该提交推进任务；原任务可能活动，也可能早已终态 | 核对实际 task 和正在处理的提交；相同请求重放必须使用相同候选字符串，不能猜 token 或盲目重试 |
| 候选修复用尽、真实业务提取失败、有效取消 | 流水线已结束，返回终态错误 | 保留 code/issues/partialResult；修正材料后发起新识别 |
| job 不属于连接、已被回收或连接已关闭 | 返回 BRIDGE_JOB_NOT_FOUND，无可访问的原任务 | 在需要时重新 prepare，不跨连接沿用令牌 |

不要只按错误码推断生命周期。例如 LIMIT_EXCEEDED 也可能发生在流水线的其他校验步骤，BRIDGE_STEP_CONFLICT 也可能针对已终态 job。结合调用位置、最后实际 task 与已完成的提交判断；message 文案不作为稳定分支条件。SDK/协议参数校验或连接异常还可能直接抛出，不一定生成 BridgeReply。

例如，已确认是活动 job 的候选字节超限拒绝时，保存原 task，调整完整候选后继续提交：

```js
export async function resubmitAfterSizeRejection(session, activeTask, correctedCandidateText) {
  return session.accept({
    jobId: activeTask.jobId,
    stepToken: activeTask.stepToken,
    candidateText: correctedCandidateText,
  });
}
```

这是已知保留任务场景的提交片段，不自动判断任意 error 是否可恢复。后续若收到修复或 data task，应改用新 task 的实际令牌。明确停止时调用 intent_cancel/session.cancel，或关闭连接/session，释放仍活动的任务。

## MCP 外层返回

MCP SDK 的 `client.callTool()` 收到工具结果封装。当前服务同时返回 text content 和 structuredContent：前者是整个 BridgeReply 的 JSON 字符串，后者是相同回复的对象。`isError` 在 kind 为 error 时为 true，其他两种回复为 false。

下面是无有效动作时的完整 MCP 成功封装：

<!-- mcp-response: result -->
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"kind\":\"result\",\"result\":{\"input\":\"订单编号是 000123。\",\"normalizedInput\":\"提供订单编号 000123，未提出操作请求。\",\"primaryIntent\":null,\"requirements\":[],\"intents\":[],\"prohibitions\":[],\"data\":{}}}"
    }
  ],
  "structuredContent": {
    "kind": "result",
    "result": {
      "input": "订单编号是 000123。",
      "normalizedInput": "提供订单编号 000123，未提出操作请求。",
      "primaryIntent": null,
      "requirements": [],
      "intents": [],
      "prohibitions": [],
      "data": {}
    }
  },
  "isError": false
}
```

task 和 error 使用相同外层结构，其 structuredContent 分别为上文对应的 BridgeReply。业务识别错误通过 error 分支返回；SDK/协议连接本身的异常仍需由调用方处理。

从真实 SDK 工具结果中解包后，按 kind 分支：

```js
export function readIntentToolReply(toolResult) {
  const reply = toolResult.structuredContent;
  if (!reply || !["task", "result", "error"].includes(reply.kind)) {
    throw new Error("没有有效的 intent-runtime 工具回复");
  }
  return reply;
}
```

收到 result 后读取 reply.result；收到 error 后读取 reply.error，并按[调用错误与任务状态](#调用错误与任务状态)判断如何继续或结束；收到 task 后按任务生成候选并调用 intent_accept。函数用于解包已连接的本服务回复，不能替代对任意不可信数据的完整结构校验。

## 任务与候选

本节供自定义宿主或 ModelExecutor 使用。候选是模型交给模块校验的过程数据，最终结果由模块组装。按每次实际返回的 instructions、payload、format 生成候选；这些过程示例不应作为持久化业务协议。

### payload 内容

payload 的字符串解码后有以下字段：

| 字段 | 出现范围 | 内容 |
| --- | --- | --- |
| `structuredLanguage` | 全部任务 | 规范化的结构化说明语言 |
| `currentInput` | 全部任务 | 本次原始 input |
| `context` | 全部任务 | 显式材料数组；没有时为 `[]`；元素为 sourceId、role、content |
| `schemaReference` | 全部任务 | 完整业务 Schema，定义和示例不作为用户事实 |
| `checkedDefault` | data | 已验证的默认 IntentResult，其中 data 为 `{}` |
| `selectedSchema` | data | 所选顶层字段的 Schema |
| `selectedFields` | data | 所选顶层字段名数组 |
| `repair` | 修复任务 | `{ candidate: string, diagnostic: string }`，之前完整候选文本及校验说明 |

context 消息数组按传入顺序得到 `context:0`、`context:1` 等 sourceId；文字 context 对应 `context:0`，role 为 background。数组消息的 role 仍为 user、assistant 或 tool。来源 `input` 对应 currentInput。

没有单独的 repair stage：core 修复仍为 core，data 修复仍为 data；payload.repair 指示修复材料。宿主提交修复后的**完整候选**，不能只提交变更字段。

### core 候选

下面的候选对应[订单成功响应](./response.md#业务字段提取成功)的默认意图。core task 的 format.schema 给出完整结构；本地逻辑添加原始 input、id、status 和最终 reason，并初始化 data。

<!-- model-candidate: core -->
```json
{
  "normalizedInput": "查询订单 000123。",
  "primaryIntent": "查询订单 000123",
  "requirements": [],
  "prohibitions": [],
  "intents": [
    {
      "action": "query",
      "target": "订单 000123",
      "requirements": [],
      "blockers": {
        "clarificationReason": null,
        "questions": [],
        "confirmationReason": null,
        "conditionReason": null
      }
    }
  ]
}
```

每项 blockers 的四个字段均必填。无相应阻塞时 reason 字段为 null、questions 为 `[]`；clarificationReason 有值时 questions 至少一条，反之亦然。questions 元素为 `{ question: string, options: string[] }`。action 为 null 必须有澄清原因和问题；所有非 null 说明和选项均不能是空白文字。多个阻塞会按[状态规则](./response.md#动作字段与状态)组装。

### data 候选

data task 使用 json_object 格式，完整候选恰有以下五个根字段。下面展示 orderId 为必填字符串且有业务 description 时的成功候选：

<!-- model-candidate: data -->
```json
{
  "data": { "orderId": "000123" },
  "evidence": [
    { "path": "/data/orderId", "mode": "exact", "sources": [{ "sourceId": "input", "quote": "000123" }] }
  ],
  "descriptionChecks": [
    { "path": "/data/orderId", "verdict": "satisfied", "explanation": "输入明确提供精确订单编号。", "sources": [{ "sourceId": "input", "quote": "000123" }] }
  ],
  "fieldResults": [
    { "path": "/data/orderId", "status": "extracted", "explanation": "输入明确提供编号。" }
  ],
  "issues": []
}
```

| 字段 | 元素结构与规则 |
| --- | --- |
| `data` | 只含所选业务字段的对象；值遵守所选 Schema |
| `evidence` | `{ path, mode, sources }`；每个返回叶值或空容器至少有一条对应路径记录，路径不能重复；mode 为 exact 或 semantic |
| `descriptionChecks` | `{ path, verdict, explanation, sources }`；覆盖每个适用且已返回的描述节点，包括适用的根描述；verdict 为 satisfied、violated 或 undetermined |
| `fieldResults` | `{ path, status, explanation }`；每个所选顶层字段恰有一条记录，包括省略的可选字段；status 为 extracted、not_provided、not_applicable 或 issue |
| `issues` | `{ code, category, path, message }`；无业务问题时为 `[]`；码和类别规则见下文 |

path 使用 JSON Pointer，例如 `/data/orderId`、`/data/items/0/id`；键中的 `~` 转义为 `~0`，`/` 转义为 `~1`。descriptionChecks 可以使用 `/data` 根路径。sources 必须非空，每项有非空 sourceId 和 quote，quote 必须是对应原始材料中的子串。exact 仅用于字符串，返回字符串必须等于至少一条对应 quote；semantic 用于有来源支持的语义映射。

explanation、message 不能为空白文字。extracted 表示字段已返回，not_provided/not_applicable 表示省略；issue 必须有匹配的业务问题。violated 或 undetermined 的描述检查会产生业务提取错误。

候选 issues 的 category 为 business_information 时，code 为 DATA_REQUIRED_MISSING、DATA_AMBIGUOUS、DATA_CONFLICT 或 DATA_DEPENDENCY_MISSING；category 为 definition 时，code 为 DATA_CARDINALITY_MISMATCH、DATA_VALUE_UNREPRESENTABLE、DATA_CONSTRAINT_VIOLATED 或 DATA_DESCRIPTION_UNDETERMINED。path 为所选字段的 `/data/...` 路径、`/data` 或 null。不能提交 DATA_SOURCE_INVALID；来源错误属于候选错误。

必填编号未提供时，提交有明确问题的完整候选，而不猜测编号：

<!-- model-candidate: missing-data -->
```json
{
  "data": {},
  "evidence": [],
  "descriptionChecks": [],
  "fieldResults": [
    { "path": "/data/orderId", "status": "issue", "explanation": "没有提供订单编号。" }
  ],
  "issues": [
    { "code": "DATA_REQUIRED_MISSING", "category": "business_information", "path": "/data/orderId", "message": "请提供订单编号。" }
  ]
}
```

这会返回[带 partialResult 的提取错误](./errors.md#完整失败示例)。每次 accept 接收 JSON.stringify(candidate) 得到的字符串，并使用实际 task 的 jobId 和 stepToken；只提交 `{ orderId: "000123" }` 或最终 IntentResult 都不满足阶段候选契约。

## 重复提交与冲突

相同 token 与完全相同候选可以复用保留的回复。候选摘要包含提交字符串，重新格式化 JSON 不保证是相同提交。已使用令牌提交不同候选，或提交不属于当前步骤的令牌，可能返回 `BRIDGE_STEP_CONFLICT`。

连接关闭、容量回收或服务重启后，原任务可能返回 `BRIDGE_JOB_NOT_FOUND`。更多边界见[任务与生命周期](../guide/lifecycle.md)。

## MCP 服务

程序内入口接受全部 BridgeConfig 选项，以及可选的 SDK transport：

```ts
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { BridgeConfig } from "@devcodex/intent-runtime/bridge";

// serveIntentMcp(config: BridgeConfig & { transport?: Transport }):
//   Promise<{ close(): Promise<void> }>
```

默认使用 stdio；传入的 Intent 实例由调用方管理。服务对象的 close 需 await，它关闭协议连接与 Bridge，不释放调用方的 Intent。

命令行入口：

```bash
intent-runtime-mcp --config <可信业务配置.mjs>
```

配置需默认导出 `{ instances: { name: IntentConfig } }`，也允许传入同一包实例构造的 Intent。命令行管理自己创建的实例，输入结束或收到退出信号时关闭服务。标准输出只用于 MCP 协议。

命令行配置只使用 instances；Bridge 容量和 transport 选项属于程序内 serveIntentMcp 入口，不从该 `.mjs` 的同名顶层字段读取。
