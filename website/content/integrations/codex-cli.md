---
title: Codex CLI
description: 在 Codex CLI 中检查 MCP 与 Skill，完成真实工具往返并保存本地验证证据。
---

# Codex CLI

Codex CLI 支持本模块的 stdio MCP 路径。当前会话中的模型按工具返回的任务生成候选，不需要 OpenAI 或 xAI API key。

## 安装和注册检查

按[快速开始](../guide/quick-start.md)安装对应版本，重新启动 CLI。在终端执行：

```bash
codex --version
codex mcp list
intent-runtime doctor
```

记录 Codex 版本和操作系统。MCP 列表应显示模块的实际注册名；通常是 `intent-runtime`，发生名称冲突时以状态文件为准。`doctor` 健康证明配置和受控 MCP 探测成功，下一步仍需用 CLI 的当前模型完成识别。

## 激活识别 Skill

自动安装的 Skill 位于用户的 `.agents/skills/`。在新会话中明确要求使用 intent-runtime Skill 识别原始材料。如果你修改了 Skill 名称，使用实际名称。

可以发送：

```text
请使用 intent-runtime Skill 和 MCP 识别以下原始请求。
使用 default 实例，fields 为 []；只返回最终 result 或 error，不执行业务动作。
原始请求：分析登录失败原因，先不要修改代码。
```

客户端需要实际调用 `intent_prepare`，再根据返回的 `instructions`、`payload`、`format` 生成完整候选，并用返回的真实令牌调用 `intent_accept`。不能由助手直接编写“看起来像”最终结果来替代工具往返。

## 完整工具流程

1. `intent_prepare` 提交原始 input、instance、明确 context 和 fields。
2. 等该次工具调用结束，再按任务生成候选。
3. `intent_accept` 提交完整 JSON 字符串 candidateText 与真实 jobId/stepToken。
4. 回复仍为 task 时，继续 core/data/repair 阶段；直到 result/error。
5. 拒绝、输出不完整或用户停止时调用 `intent_cancel`。

业务字段实例请用[配置示例](../guide/configuration.md)，例如 `orders` 与 `fields: ["orderId"]`。未定义 Schema 的默认实例不会自动提取任意字段。

## 本地验收

建议至少检查以下材料，每例保存原始输入、实际工具调用、最终结果与客户端版本：

| 场景 | 检查点 |
| --- | --- |
| 分析原因，暂不修改 | 没有增加修复动作，保留禁止事项 |
| 先给方案，确认后再实施 | 确认前提与范围正确 |
| 查询订单 000123 | schema 选定时原样保留前导零 |
| 原请求撤回，改为只分析 | 当前有效请求正确，不把已撤回动作继续执行 |
| 必填业务值未提供 | issues 与 partialResult 被正确处理 |
| 显式停止、关闭连接 | 取消终态和任务释放行为符合[生命周期](../guide/lifecycle.md) |

更多语义用例和准确率方法见[测试与兼容](../testing/validation.md)。工具注册、Skill 文件存在、MCP 测试通过分别证明不同条件，都不能代替实际 CLI 当前模型验收。

## 常见问题

- 工具未出现：重启会话，检查用户注册与项目/profile 覆盖，再运行 doctor。
- Skill 未生效：检查实际 Skill 名和内容，在会话里明确启用工作流；源码本地安装不会自动创建 Skill。
- 修改业务配置后结果未变：重启 MCP 连接，检查工具回复中公布的 instance。
- 把原始 input 摘要后提交：核对实际 `intent_prepare` 参数，要求原样提供材料。
