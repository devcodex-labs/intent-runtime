---
title: 任务与生命周期
description: 默认无解析总时限和任务自动过期，理解取消、连接关闭、实例释放与容量限制。
---

# 任务与生命周期

本页的“任务”是一次意图识别及候选交接流程。用户业务任务的计划、进度和执行状态由上层应用管理，不保存在识别 job 中。

模块默认不为 `Intent.parse()` 添加解析总时限，MCP 活动任务也默认不按时间自动过期。一个任务持续数天，单纯经过时间不会使它失效。

## 默认行为与边界

| 场景 | 行为 |
| --- | --- |
| API parse 未指定 timeoutMs | 不增加模块解析总期限 |
| MCP task 长时间等待候选 | 默认没有时间过期和 expiresAt |
| MCP 连接关闭 | 该连接的任务被释放 |
| 已有 MCP 的逻辑 session 终止 | 调用所属 adapter session.close，释放其任务 |
| HTTP 临时 TCP/SSE 断流 | 宿主保留逻辑 session；不自动当作请求取消或会话关闭 |
| MCP 进程重启 | 内存中的任务不可恢复，需要重新 prepare |
| `Intent.dispose()` | 停止实例上的活动识别，之后不能再使用该实例 |
| 达到活动任务或保留容量 | 报告容量问题，已完成记录可能按容量回收 |

长期任务依赖原 MCP 连接、进程和实例仍然存活。关闭客户端、重启电脑或更换 MCP 服务，会改变这些条件。当前实现没有跨进程持久化恢复。

## 取消与释放

对活动任务调用 `intent_cancel`，默认 outcome 为 `cancelled`，返回终态错误 `MODEL_ABORTED`。模型拒绝或输出不完整时可分别提交 `refusal`、`incomplete`，对应 `MODEL_REFUSED`、`MODEL_OUTPUT_INCOMPLETE`。

提交调用返回 error 不一定意味着已取消或结束任务。参数、令牌和部分容量拒绝可能保留活动 job；恢复或停止的判断见[调用错误与任务状态](../api/bridge-mcp.md#调用错误与任务状态)。默认没有时间过期机制，明确停止时应取消或关闭所属连接/session。

任务已完成且记录仍保留时，参数有效的 cancel 返回原终态，可能仍是 `result`；取消不会改变已完成的结果。任务被回收或不属于当前连接时返回 `BRIDGE_JOB_NOT_FOUND`。

程序内 Bridge 可关闭单个 session，或关闭整个 bridge。传给 bridge 的 Intent 实例由调用方负责释放。API 路径在不再需要实例时执行 `intent.dispose()`；这会影响该实例上所有活动请求，并返回 `INSTANCE_DISPOSED`。释放后需要创建新实例。

### 单次请求与步骤取消

当前源码的 parse(request,{signal}) 和 Bridge accept(request,{signal}) 为下一兼容版本新增原生选项；不向请求 JSON 增加 signal。有效 parse 在模型调用前或执行中取消返回 MODEL_ABORTED，data 阶段可保留已有 core；共享实例其他调用继续。显式 deadline 和实例释放沿用 MODEL_TIMEOUT/INSTANCE_DISPOSED。

accept 先验证 owner、token 和候选冲突。旧步骤重放不绑定新取消；步骤已推进后旧信号不能停止下一步。同一活动 job 的重复提交等待共享处理，有效等待者取消会结束这个 job，其他 job 不受影响。

### Adapter 拥有权

每个逻辑客户端 session 独立 adapter.connect，并持续复用。session.close 取消所属 parse 和 Bridge 任务；adapter.close 关闭其全部会话。两者幂等，不 dispose 调用方 Intent，也不关闭宿主 Server/Transport/executor。关闭后所属工具返回 BRIDGE_JOB_NOT_FOUND；未知工具仍回退宿主。

不要将 HTTP 底层断流直接当作逻辑请求取消。取消不承诺强杀忽略 signal 的外部代码；异步收尾移除监听与活动计数。具体接口见 [MCP Adapter](../api/mcp-adapter.md)。

## 容量与回放

Bridge 默认最多 32 个活动任务，保留任务记录上限 128，保留字节上限 8 MiB。这些容量在同一 Bridge 的全部连接和命名实例之间共享；保留记录包括活动和已终态任务。字节预算统计内部任务与回复等序列化内容，详见[容量统计](../api/bridge-mcp.md#配置与容量)。

已完成任务的回复没有默认时间 TTL，但可能因容量被回收，因此不把回放当作永久历史。

同一连接、同一 stepToken 和相同候选的重复提交可以返回保留的回复；改变已提交候选会产生冲突。业务应用应保存最终结果，不能靠无限回放存储数据。

## 模型等待与本地保护

没有模块总时限不代表外部服务无限等待。调用方、模型服务商或 OpenAI SDK 自身仍可能取消或超时，模块会映射相应错误。

本地 Schema 校验有独立的资源保护预算，防止异常正则或高成本校验卡住进程；安装诊断也有自动的启动与协议等待限制。这些保护不规定用户任务只能持续多久，快速开始无需配置 timeout。

高级调用方可以显式设置 `IntentConfig.timeoutMs`（0 表示不增加总期限）。Bridge 的 `jobTtlMs` 和 `replayTtlMs` 仅为已弃用的兼容选项，常规使用保持默认即可。
