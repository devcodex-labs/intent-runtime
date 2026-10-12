---
title: 接入示例索引
description: 六条主接入流程、公共配置、完整可运行文件、受控与真实模型验证方式。
---

# 接入示例索引

示例使用公开 npm 入口和 ESM JavaScript，复用业务配置、候选驱动和客户端。Adapter 示例使用下一兼容版本的新增接口；当前源码构建可运行，已发布 npm 1.0.2 的能力范围见 [快速开始](../guide/quick-start.md)。

## 六条主流程

| 流程 | 仓库文件 | 说明 |
| --- | --- | --- |
| SDK API/自定义模型 | examples/api/parse.mjs、custom-executor.mjs | 直接七字段结果；API 模型或自有 generateText；Schema/context/fields 与释放 |
| Bridge 候选协作 | examples/bridge/recognize.mjs | 无 MCP 的 prepare/accept 完整循环；拒绝、生成失败取消与 close |
| 独立 stdio/Codex | examples/mcp/stdio/client.mjs、intent.config.mjs；examples/codex/intent.config.mjs | 生产 CLI 与标准客户端；Codex 配置和真实使用分开验收 |
| 已有 MCP executor | examples/mcp/executor/server.mjs、client.mjs | 原工具/资源/Prompt 共存；intent_parse 单次结果 |
| 已有 MCP host | examples/mcp/host/server.mjs、client.mjs | 三工具循环，实际令牌、受控修复和清理 |
| SDK v2/vextjs 消费 | examples/mcp/sdk-v2/registration.mjs；tests/consumers/vextjs | 公共 SDK 注册及固定源码实际工厂验证；不杜撰产品公开出口 |

## 运行前提和命令

Node >=20.0.0；从源码运行前 npm ci 和 npm run build。API 真实驱动明确指定 provider/model/key，并安装可选 openai@6；自定义驱动从可信本地模块导出 generateText。vextjs 消费自身使用其支持的 Node 版本和隔离的 SDK v2 锁文件。

```sh
node examples/api/parse.mjs --fixture
node examples/api/custom-executor.mjs --fixture
node examples/bridge/recognize.mjs --fixture
node examples/mcp/executor/client.mjs --fixture
node examples/mcp/host/client.mjs --fixture --repair
```

生产 CLI 客户端在已安装包的独立消费项目运行，完整前提见 [stdio 接入](../integrations/stdio-mcp.md)。从源码 npm run smoke:package 会实际打包、安装并验证 API/Bridge/两种 MCP/生产 CLI 共七次受控例子运行。

--fixture 只接受已声明的固定订单请求，展示非空 requirements、prohibitions 和前导零，不冒充语义模型。--repair 只在明确 fixture 模式下刻意提交一次错误。API --no-data 展示 fields=[]。

API 例子将 Ctrl+C 转为当前 parse 的原生 signal 取消，结束后移除监听并释放自己创建的实例；共享应用实例按调用方拥有权释放。单次取消不会要求 dispose 其他请求。

省略 --fixture 后：API/Bridge/模拟宿主客户端读取 INTENT_PROVIDER、INTENT_MODEL、INTENT_OPENAI_KEY 或 INTENT_XAI_KEY；自定义例子读取 INTENT_MODEL_DRIVER。全部变量在本地环境配置，不硬编码秘密或默认模型。真实 Codex 模式由客户端模型完成候选，不使用此模拟驱动。

## 共用配置与场景

| 共用场景 | 正常/负向结果 | 参考 |
| --- | --- | --- |
| 语言与命名实例 | 默认 en；general 无 Schema、orders 提取编号；实例名必须匹配 | [配置](../guide/configuration.md) |
| Schema/fields/context | 顶层字段选择；省略/子集/[]；显式指代/修正；未知字段失败 | [字段](../guide/schema-fields.md)、[上下文](./context-fields.md) |
| 模型与候选 | complete/refusal/incomplete；core/data/repair；候选不同于最终结果 | [执行器](../api/intent.md)、[Bridge](../api/bridge-mcp.md) |
| 工具和错误 | 原工具共存、前缀/冲突、未知工具回退、JSON 错误及 partialResult | [已有 MCP](../integrations/existing-mcp.md)、[错误](../api/errors.md) |
| 取消/重放/关闭 | 当前请求取消、共享实例继续、跨会话失败、旧 token/候选冲突、资源拥有权 | [生命周期](../guide/lifecycle.md) |

固定候选的工程检查、真实模型语义、真实 Codex 使用和实际消费者验证分别记录。HTTP 宿主例子 E-11 为 P1，不包含内置 CLI HTTP 监听，不计入 P0 完成证据。
