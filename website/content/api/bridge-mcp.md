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

下面的函数完成 prepare/accept 循环，返回终态 result 或 error。`generateCandidate(task)` 由宿主提供，必须按实际 task 的 instructions、payload、format 生成完整 JSON 字符串；它不是模块内置的模型客户端。

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

取消 outcome 为 `cancelled`、`refusal`、`incomplete`，默认 cancelled。detail 最多 **2048 UTF-8 字节**；例如 682 个“中”为 2046 字节，683 个为 2049 字节，会被拒绝。

活动任务取消分别返回 `MODEL_ABORTED`、`MODEL_REFUSED`、`MODEL_OUTPUT_INCOMPLETE`。已终态且仍保留的任务在参数有效时返回原终态，可能仍是 result；任务被回收后返回 `BRIDGE_JOB_NOT_FOUND`。MCP 的 isError 为 true 不意味着取消失败。

## 回复类型

| kind | 内容 |
| --- | --- |
| `task` | jobId、stepToken、stage、instructions、payload、format；默认没有 expiresAt |
| `result` | 完整公共 `result` |
| `error` | 可序列化的 `error`，含 code、stage、issues 和可选 partialResult |

收到 task 后结束当前工具调用，再生成候选；如果下一次回复仍为 task，继续直到终态。使用每次实际回复的令牌，不从文档示例编造。

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
