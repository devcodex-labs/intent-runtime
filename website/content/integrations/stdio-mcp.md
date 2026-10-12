---
title: 独立 stdio MCP
description: 在本地项目安装并通过生产 CLI 连接标准 MCP 客户端，完成三个工具的候选协作流程。
---

# 独立 stdio MCP

生产命令 intent-runtime-mcp 通过 stdin/stdout 提供 MCP，客户端启动并管理子进程。它不监听 HTTP，也不因为接入自定义 transport 就成为内置 HTTP 服务。

## 安装与可信配置

在消费项目安装 @devcodex/intent-runtime。仅本地安装不会写 Codex 注册或 Skill；使用 Codex 的全局自动配置见 [CLI](./codex-cli.md) 和 [Desktop](./codex-desktop.md)。

```sh
npm install @devcodex/intent-runtime
```

创建项目内的可信 intent.config.mjs：

```js
export default {
  instances: {
    general: { language: "zh-CN" },
    orders: {
      language: "zh-CN",
      schema: { type: "object", properties: { orderId: { type: "string", description: "当前请求的订单编号，保留前导零。" } }, required: ["orderId"], additionalProperties: false },
    },
  },
};
```

客户端启动本地可执行文件，参数为 --config 与配置绝对路径，cwd 为消费项目。手动启动也可通过本地 npm bin：

```sh
npm exec --no -- intent-runtime-mcp --config ./intent.config.mjs
```

手动运行后它会等待协议输入，不能用浏览器访问 localhost 验证。配置按其所在目录解析 import，只有日志写 stderr；stdout 保留给协议。

## 工具调用

initialize 后调用 tools/list，可看到 intent_prepare、intent_accept、intent_cancel。先提交 instance:orders、原始 input、可选 fields/context；prepare 返回 core task，宿主按实际任务生成 JSON 候选后调用 accept。data/repair task 同样处理，最终成功位于 structuredContent.result。

每步使用实际 jobId/stepToken，不从示例生成令牌。结束生成或拒绝/不完整时 cancel；正常结束关闭客户端连接。参数、候选和结果的完整结构见 [Bridge 与 MCP](../api/bridge-mcp.md)。

## 完整客户端示例

仓库 examples/mcp/stdio/client.mjs 启动生产 CLI、验证三个工具、完成 core/data 和关闭；它与 examples/mcp/stdio/intent.config.mjs、共享候选驱动一起随包提供。打包消费检查在隔离安装环境中运行它，实际输入/结果包含要求、禁止事项和 orderId=000123。

显式 --fixture 使用受控候选，只证明工程链路。真实宿主生成候选无需为服务配置 API key；示例客户端模拟宿主时，省略 --fixture 后使用其显式 API 驱动，需要设置模型和凭据。

源码用户可先 npm pack，并在独立消费项目安装生成的包，再运行包中例子。安装后的客户端将消费项目 node_modules/.bin 加入子进程 PATH，兼容本地安装；不要求全局安装。

## 生命周期与排错

连接结束会关闭所属 Bridge 任务，CLI 清理自己创建的 Intent；调用方传入的同包实例仍由调用方管理。正常任务默认不按时间过期，但服务重启或逻辑连接关闭后原 job 不可恢复。

启动失败检查 Node >=20.0.0、命令/配置路径、cwd、配置依赖和 stderr；不把等待 stdin 当失败。协议可用不等于真实模型语义或 Codex 已实际使用，证据分层见 [验证](../testing/validation.md)。
