# V2 接入示例

这些示例使用 V2 的公开导出。安装当前构建的 tarball 或对应 V2 发行包和 `schema-dsl@3.0.4` 后运行。

- `api/parse.mjs`：配置环境中的模型名称与凭据，用 Responses API 识别订单请求。
- `codex/intent.host.config.mjs`：仅使用当前 Codex 模型的 stdio 配置，不配置额外 API 执行器。
- `mcp/intent.executor.config.mjs`：独立 MCP 使用已配置 API 执行器。
- `mcp/attach.mjs`：给已有 MCP tools 增加识别能力，保留原工具、资源与 Prompt 的路由和所有权。

`intent-runtime-mcp --config /absolute/path/intent.host.config.mjs` 启动服务。不要向 stdio 的 stdout 写日志。配置模块是调用方明确选中的可信 Node.js 代码。

全局安装后显式执行 `intent-runtime setup --host codex --config /absolute/path/intent.host.config.mjs`。安装本身不修改宿主配置。
