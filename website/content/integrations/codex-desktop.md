---
title: Codex Desktop
description: 在 Codex 桌面客户端完成自动配置检查或按表单手动接入当前源码。
---

# Codex Desktop

桌面路径通过 stdio MCP 与当前会话模型协作。自动全局安装使用用户级 Codex 配置，并安装识别 Skill；客户端必须重新加载配置才能看到变更。

## 自动安装后的检查

1. 按[快速开始](../guide/quick-start.md)安装或从当前源码打包全局安装。
2. 在终端运行 `intent-runtime doctor`，记录诊断结果。
3. 完全退出并重新打开 Desktop，检查自定义 MCP 列表与可用工具。
4. 在会话中明确调用 intent-runtime Skill，按 [CLI 中的完整工具流程](./codex-cli.md#完整工具流程)完成真实识别。

CLI 与 Desktop 共用注册机制，但读取配置、加载 Skill 和调用模型的实际行为需要分别验证。不要从 CLI 成功直接推断 Desktop 已验收。

## 从源码手动配置

当前本地目录为 `D:\Worker\intent-runtime` 时，先执行：

```powershell
cd D:\Worker\intent-runtime
npm ci
npm run build
```

在客户端“连接至自定义 MCP”表单填写：

| 项目 | 值 |
| --- | --- |
| 名称 | `intent-runtime`；已有同名注册时先核对，避免重复 |
| 类型 | STDIO |
| 启动命令 | `node`，或 `where.exe node` 查询到的 Node 完整可执行路径 |
| 参数 1 | `D:\Worker\intent-runtime\dist\transports\mcp\main.js` |
| 参数 2 | `--config` |
| 参数 3 | `D:\Worker\intent-runtime\examples\codex\intent.config.mjs` |
| 工作目录 | `D:\Worker\intent-runtime` |
| 环境变量、环境变量传递 | 当前示例不需要模型 API key，可留空 |

**每个参数单独添加一行。** 不把整串命令粘贴进“启动命令”，路径在表单中通常不需要额外引号。保存后重载连接。

仓库中的示例实例名为 `orders`，包含必填 `orderId`。结构化说明默认 en；希望中文时在实例配置中增加 `language: "zh-CN"`。自定义配置路径和工作目录参见[配置与多实例](../guide/configuration.md)。

## 手动配置后的识别指令

源码本地安装不会自动安装 Skill。可以按仓库中的[协作流程](https://github.com/devcodex-labs/intent-runtime/blob/main/integrations/codex/workflow.md)明确指导当前模型，或测试全局安装流程以安装 Skill。

首次可发送：

```text
使用 intent-runtime MCP，instance 为 orders，fields 为 ["orderId"]。
原始 input：查询订单 000123
先调用 intent_prepare。工具返回后按其 instructions、payload 和 format 生成完整候选，
用回复的真实 jobId、stepToken 调用 intent_accept。
若返回新 task 则继续，result 表示成功；error 按[任务错误处理](../api/bridge-mcp.md#调用错误与任务状态)判断是否仍有活动任务。明确停止时 cancel 或关闭连接；只识别，不查询订单。
```

检查最终 `data.orderId` 是字符串 `"000123"`，input 保持原样，当前会话确实经过 prepare/accept。再验证否定、确认、澄清、多意图和提取失败；详见[本地验收清单](./codex-cli.md#本地验收)。

## 启动失败如何排查

用表单里的相同命令、参数和工作目录在终端启动，检查标准错误。STDIO 服务等待协议输入时不会像 HTTP 服务一样打印监听地址，不能把“没有输出”单独判为失败。

常见原因是未构建、Node 路径不可用、配置 import 依赖无法解析、配置语法错误，或业务代码向标准输出写日志。源码修改后重新构建并重载 MCP。
