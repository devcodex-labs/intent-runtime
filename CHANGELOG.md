# Changelog

## 2.0.3

- Reject a withdrawn or otherwise non-current intent key in `relatedKeys` as `MODEL_OUTPUT_INVALID` at `/relatedKeys/<n>` (`REFERENCE_NOT_FOUND`) instead of failing with `INTERNAL_PROCESSING_FAILED`. MCP host requests stay open for a corrected submission. Add shared-core and MCP host regressions.
- Make plaintext `http` `baseURL` acceptance symmetric across IPv4 and IPv6: additionally allow shared CGNAT `100.64.0.0/10` and IPv4-mapped loopback, and reject IPv6 link-local `fe80::/10` like IPv4 `169.254.0.0/16`. Document the exact ranges in English and Chinese and test the full matrix.
- Document truthfully that the current version never sets `IntentError.partialResult` and never produces `PROCESSING_INCOMPLETE`. The type field is retained; public types are unchanged.
- Generate and verify the Chinese MCP host order and clarification examples from the same scenarios as English, and align the Chinese description.
- Queue rather than cancel an in-progress documentation deployment so a release deployment always completes.
- Use 1200×630 PNG Open Graph images rendered from the existing SVG cards.
- Make the host lease-release acceptance test cancel with valid arguments and assert the result under a single admission slot.

## 2.0.2

- Apply the semantic evidence gate to descriptions inside schema-valued dependencies, including local references and nested instances. Preserve known inactive dependencies, conservative unknown presence, and present values such as `false`, `0` and `null`. Use the same applicability knowledge for selected values and unselected field diagnoses.
- Require every change condition to reference a current global or node constraint. Reject empty supplied condition keys instead of silently treating them as absent; retain explicit `null` and valid unresolved changes. Report the exact candidate path so MCP hosts can correct a submission within the same request.
- Reject unchanged `set` deltas and removals whose prior path is proven absent by a complete baseline. Preserve partial Context, real null changes, object key-order equivalence and legitimate array removals.
- Require withdrawal turns to contain a valid intent or unresolved withdrawal, and reject global constraints with a non-null owner rather than discarding it.
- Add shared-core and MCP correction regressions and update the English and Chinese Schema and response references. Public result fields, `schemaVersion`, configuration, dependencies, tool names and single-request behavior are unchanged.

## 2.0.1

- Coalesce redundant formal field diagnoses only against an independent core proof for the same owner, container and field path. Preserve semantic field problems, sources, clarification options and suggestion references; reject contradictory formal claims. Correlate field targets, categories and codes in the private OpenAI strict format. Reject inference targets at business containers and their descendants, including nested-child paths, while retaining semantic inference, field evidence and deltas. Public result fields, configuration, dependencies and single-request behavior are unchanged.

- Use a shared internal strict-output Schema projection for OpenAI Responses and Chat Completions. Resolve local definitions, flatten supported union wrappers, require nullable source quotes on the wire, and restore only their registered omissions before the unchanged core validation. Preserve duplicate-key rejection, response limits, cancellation, and single-request behavior. xAI and explicit text mode retain their existing behavior.
- Report bounded candidate JSON Pointer paths for structure errors across Native, API and MCP. Document strict-capable gateway requirements and distinguish custom executor examples from the built-in OpenAI codec.
- Constrain OpenAI generation by object identity, reference kind and change state; use pointer-only current-input sources and keep other exact source quotes. Clarify snapshot delta paths and formal field invalidation. Locate invalid related keys, delta paths and existing-object add operations precisely, while retaining the shared candidate/result contract and single-request behavior.

- Name MCP tools `intent_runtime_prepare`, `intent_runtime_accept`, `intent_runtime_cancel` (host) and `intent_runtime_parse` (executor) by default across embedded adapters, stdio, HTTP and Codex. Optional `toolPrefix` adds to the complete name; multiple instances still share one tool set. Update the Codex Skill, diagnostics, examples and documentation. Tool parameters and result schemas are unchanged.
- MCP callers using the 2.0.0 tool names must update their explicit calls; old tool-name aliases are not registered. Codex users should rerun `setup` with their existing configuration and registration name to refresh the managed Skill, then reload the client.
- Clarify how to add tools to an existing MCP server, preserve other tools and reject duplicate names. Complete the user documentation and response examples, preserve existing MCP section links, and validate both LF and CRLF documentation.
- Fix installed-entry release verification and allow for npm registry processing before verifying the published package and default installation.

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
