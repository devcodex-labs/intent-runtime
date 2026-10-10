---
title: Bridge 与 MCP
description: BridgeSession、任务交接、重放语义和 intent_prepare、intent_accept、intent_cancel 三个 MCP 工具。
---

# Bridge 与 MCP

Bridge 管理宿主协作的识别任务，宿主负责生成候选。MCP 把该流程暴露为三个工具。

## 创建 Bridge

```js
import { Intent } from "@devcodex-labs/intent-runtime";
import { createIntentBridge } from "@devcodex-labs/intent-runtime/bridge";

const intent = new Intent({ language: "zh-CN" });
const bridge = createIntentBridge({ instances: { default: intent } });
const session = bridge.connect();
try {
  const reply = session.prepare({ instance: "default", input: "查询订单 000123", fields: [] });
  // task 交给宿主模型；宿主生成候选后再调用 session.accept。
  console.log(reply);
} finally {
  session.close();
  bridge.close();
  intent.dispose();
}
```

例子只演示创建与交接，不执行完整模型识别。每次 `connect()` 产生独立的任务归属，不能跨连接使用 jobId 和 stepToken。

## 配置

| 选项 | 默认值 |
| --- | --- |
| `instances` | 必填，非空的命名 Intent 实例集合 |
| `maxJobs` | 32 个活动任务 |
| `maxReplayEntries` | 128 个保留条目 |
| `maxReplayBytes` | 8388608 字节 |

已弃用的兼容选项 `jobTtlMs` 与 `replayTtlMs` 默认均为 0，无时间 TTL。正常使用无需设置。

## 工具与 session 方法

| MCP 工具 | Bridge 方法 | 参数 |
| --- | --- | --- |
| `intent_prepare` | `session.prepare()` | `instance`、`input`；可选 `fields`、`context` |
| `intent_accept` | `await session.accept()` | `jobId`、`stepToken`、完整字符串 `candidateText` |
| `intent_cancel` | `session.cancel()` | `jobId`；可选 `outcome`、`detail` |

取消 outcome 为 `cancelled`、`refusal`、`incomplete`，默认 cancelled。detail 最大 2048 个字符。取消会返回对应终态错误；MCP 的 isError 为 true 不意味着取消失败。

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

`@devcodex-labs/intent-runtime/mcp` 导出 `serveIntentMcp({ instances, transport? })`，返回带异步 `close()` 的服务对象，默认使用 stdio。传入的 Intent 实例由调用方管理。

命令行入口：

```bash
intent-runtime-mcp --config <可信业务配置.mjs>
```

配置需默认导出 `{ instances: { name: IntentConfig } }`，也允许传入同一包实例构造的 Intent。命令行管理自己创建的实例，输入结束或收到退出信号时关闭服务。标准输出只用于 MCP 协议。
