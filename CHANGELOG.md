# Changelog

## 2.0.0

- Rewrite the recognition core. The complete intent tree lives in `effective`; `turn.intentIds` and `changes` associate the current turn with that tree. Results and baselines use format version `2.0-draft.6`.
- Validate selected fields, declared dependencies, and multi-turn invalidation through schema-dsl 3.0.4. Distinguish existence from value validity, preserve leading zeros, and retain field ownership.
- Share one recognition core across Native, Responses / Chat Completions APIs, and MCP executor/host modes. Support compatible gateways and custom `ModelExecutor` implementations without implicit retries, model fallback, or business execution.
- Support ESM JavaScript and TypeScript applications. CLI configuration accepts `.js` / `.mjs`; compile TypeScript configuration to ESM first. A normal npm installation resolves the required schema-dsl peer automatically.
- Add standalone Streamable HTTP with configurable bind address, port, path, and `--public-origin`. HTTP uses stateful protocols 2025-06-18 / 2025-11-25; stdio also supports 2026-07-28. Preserve session isolation and validate public Host / HTTPS Origin independently of the bind address. The deployment layer supplies TLS and authentication.
- Add explicit `setup`, `doctor`, and `clean` commands while preserving user edits and other MCP registrations. Ordinary installation does not modify client configuration.
- Replace the previous integration paths, examples, documentation, and engineering scripts. This release does not retain the previous API compatibility layer.
- Provide complete English documentation at the existing root URLs and Simplified Chinese under `/zh/`, with localized navigation, search, and scenario downloads. Update the English README, model executor guide, existing-server integration, result consumption, and error recovery. Back up and migrate old automatic registrations using the maintenance guide; setup does not take ownership of unknown registrations or user edits.
- Automatically run full CI, package checks, npm publication, and isolated registry-install verification when a matching version tag is pushed. Create the GitHub Release from this section and deploy documentation from the same commit. Resume an existing package version only when its integrity matches; see the release guide for interrupted-release recovery.

## V1 归档变更 — 未发布

- Add an SDK-independent MCP adapter with host prepare/accept/cancel and server-executor intent_parse modes, exact prefixes, named-instance discovery and caller-owned lifecycle.
- Add native per-call cancellation to Intent.parse and Bridge accept. Validate ownership/tokens/conflicts before cancelling an active step; preserve completed replays and shared instances.
- Preserve legacy stdio structured errors; new adapters return JSON error text with isError=true for success-only outputSchema compatibility.
- Add complete public integration examples, production CLI package checks, SDK v1/v2 protocol checks and a fixed actual VextJS source consumer.
- Expand Chinese integration/API/configuration/lifecycle/acceptance references and English README/examples. No product HTTP listener, default deadline or time TTL is added.
- 后续 tag 发布按已发布稳定版本之间的实际差异判定：安装维护、文档和版本元数据改动通过工程检查即可发布；识别、提取、协议等行为变化仍要求真实验收，未知范围与无法确认基线时同样要求验收。

## 1.0.2 — 2026-10-10

- 修复 Codex MCP 配置在反复安装、修复与清理后累积空行的问题，保留用户原有格式、LF/CRLF 换行及注释。
- 补齐完整响应类型和示例，覆盖全局与局部 requirements、复合条件、动作分类、复杂业务数据、部分字段及跨字段约束。
- 明确 Bridge/MCP 调用错误与任务生命周期、OpenAI/xAI 阶段响应格式、资源限制、输出语言及测试覆盖范围。
- 完善 README 的安装维护和 API 使用指引，将 README、完整响应示例及站点链接纳入文档检查。
- tag 发布不再依赖真实模型与客户端验收清单，保留版本匹配、精确提交 CI、自动化回归、安装包和校验和检查；真实语义与客户端评测仍可独立执行。

## 1.0.1 — 2026-10-10

- 将仓库中的包名称、安装路径、示例与文档统一为 @devcodex/intent-runtime，与已发布的正式包保持一致。
- 修正文档校验在 Windows 下对 CRLF 换行、虚拟文件路径与构建目录边界的处理。

## 1.0.0 — 2026-10-10

- 提供对象式 Intent.parse，识别当前有效请求，保留多动作、要求、禁止事项及澄清、确认和条件状态。
- 支持显式上下文、注册语言标签和 schema-dsl / JSON Schema 业务字段，按顶层字段选择提取范围。
- 共享 core/data 流水线，校验候选结构、业务描述和来源；区分候选修复与真实信息缺失，保留默认意图部分结果。
- 提供 OpenAI/xAI Responses API 适配器，以及 prepare/accept/cancel Bridge 与 stdio MCP 服务。
- 直接全局安装时自动配置检测到的 Codex CLI/Desktop，安装识别 Skill，提供 doctor、修复和清理命令。
- 默认不增加解析总期限，Bridge 任务不按时间自动过期；容量不足时优先回收已完成记录，保持活动任务和令牌可继续使用。
- 使用可中断的本地 Schema 校验及资源预算，支持并发、实例释放、取消、安装恢复与用户配置保护。
- 库运行时支持 Node.js ≥20.0.0 和 ESM；CI 覆盖 Linux、Windows、macOS 与 Node 20.0.0/24.x。
- 提供基于 Rspress 2.0.23 的中文使用文档，补齐公开 API、Schema 支持范围、配置、错误分类和维护排障参考。
- 发布流程由版本 tag 触发，检查版本匹配、验收材料及精确提交 CI，发布 npm 包后创建含安装包和校验和的 GitHub Release。
