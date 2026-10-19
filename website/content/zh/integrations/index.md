# 选择接入方式

先选择你正在做的事，再按对应路径准备模型与配置。Intent Runtime 将给定请求转成结构化意图，应用继续负责订单查询、代码修改及业务工具。

| 你的使用方式 | 从哪里开始 | 模型来源与前置条件 |
|---|---|---|
| 在Node.js应用中调用 | [快速开始](/zh/guide/quick-start) | 显式配置模型API或自定义执行器 |
| 在Codex中使用当前模型 | [Codex接入](/zh/integrations/codex) | 当前宿主生成候选，无需额外模型API Key |
| 启动一个独立MCP服务 | [stdio / HTTP服务](/zh/integrations/mcp) | host用当前模型；executor用服务端所配API |
| 添加到已有MCP的tools | [完整挂载示例](/zh/integrations/mcp-sdk) | 保留原服务的连接和工具，按需选host/executor |
| 接入自有模型网关 | [模型与协议选择](/zh/integrations/api#连接自有网关) | Responses / Chat Completions兼容网关直接配置地址；其他协议再自定义 |

| 路径 | 是否需要独立模型 Key | 连接与状态由谁管理 |
|---|---|---|
| Node / executor | 使用所配 API 时需要 | 应用管理调用、历史与业务状态 |
| Codex / host | 不需要额外 Key | Codex 提供当前模型，Runtime 管本次交接 |
| 已有 MCP Server | 按所选模式 | 原 SDK 管 transport，每逻辑客户端一个 session |

## 各入口要准备什么

| 任务 | 配置放哪里 | 如何启动 | 首次成功判断 |
|---|---|---|---|
| Node.js 项目调用 | 应用项目中的 JavaScript / TypeScript，凭据来自你的环境 | 运行应用文件 | parse 返回 IntentResult，可找到目标与约束 |
| Codex 当前模型 | 可访问的可信 .js/.mjs，setup 使用其绝对路径 | 登记后重载客户端或开启新 CLI 会话 | 三个 host 工具可见，accept 返回最终结果 |
| 已有 MCP 添加工具 | 现有服务代码和本地依赖 | 原 SDK 启动方式 | 原工具与新增工具均可调用 |
| 独立 MCP | 可信 .js/.mjs；executor 还需模型与凭据 | 默认stdio；HTTP加--transport http及端口 | 客户端连接后能列出并调用对应模式工具 |

全局安装不让任意配置文件自动解析全局依赖；配置需要导入包时，放在装有依赖的项目内。HTTP 可直接启动独立服务，也可嵌入已有服务。完整步骤见各入口，不必先阅读全部类型。

先按[安装与版本](/zh/guide/installation)完成本地或全局安装，再进入所选路径。Native、独立MCP和已有MCP共用同一识别核心，成功结果均为[IntentResult](/zh/guide/results)。

## host和executor有什么区别

- **host**：prepare返回识别材料，当前宿主模型生成候选，再由accept校验并组装结果。服务端不暗中另调模型。
- **executor**：Native的parse或MCP的intent_runtime_parse直接调用所配置的执行器。需要调用方提供可用模型与凭据。

工具注册只暴露能力，不会自动监听所有消息。宿主兼容范围见[兼容与支持](/zh/testing/validation)。
