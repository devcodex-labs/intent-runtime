# 选择接入方式

Intent Runtime把你提供的用户请求转成结构化意图。先选调用入口，再选模型来源；它不会替应用查询订单、修改代码或选择业务工具。

| 你的使用方式 | 从哪里开始 | 模型来源与前置条件 |
|---|---|---|
| 在Node.js应用中调用 | [快速开始](/guide/quick-start) | 显式配置模型API或自定义执行器 |
| 在Codex中使用当前模型 | [Codex接入](/integrations/codex) | 当前宿主生成候选，无需额外模型API Key |
| 启动一个独立MCP服务 | [stdio服务](/integrations/mcp#独立-stdio-服务) | host用当前模型；executor用服务端所配API |
| 添加到已有MCP的tools | [挂接adapter](/integrations/mcp#添加到已有-mcp-tools) | 保留原服务的连接和工具，按需选host/executor |
| 接入自有模型网关 | [自定义执行器](/integrations/api#自定义-modelexecutor) | 应用将网关协议转换成ModelReply |

先按[安装与版本](/guide/installation)获取本文对应的V2包。Native、独立MCP和已有MCP共用同一识别核心，成功结果均为[IntentResult](/guide/results)。

## host和executor有什么区别

- **host**：prepare返回识别材料，当前宿主模型生成候选，再由accept校验并组装结果。服务端不暗中另调模型。
- **executor**：Native的parse或MCP的intent_parse直接调用所配置的执行器。需要调用方提供可用模型与凭据。

工具注册只暴露能力，不会自动监听所有消息。宿主兼容范围见[兼容与支持](/testing/validation)。
