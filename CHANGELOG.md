# Changelog

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
