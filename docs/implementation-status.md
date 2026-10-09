# V1 实施与验证记录（2026-10-09）

最新需求与技术方案已按确认决策同步到 docs/requirements/overview.md、docs/design/technical-plan.md，实施基线见 docs/decisions/001-v1-contract.md。当前版本为 1.0.0-dev.0，可进入本地真实联调，正式发布验收尚未完成。

## 已实现

- 唯一对象请求入口、原文保留、显式上下文、默认英文及登记语言标签检查。
- 默认识别与字段提取两个阶段，共用候选校验、有限修复和错误分类；扩展失败保留默认 partialResult，扩展整体提交。
- 原生 schema-dsl 定义检查、顶层字段投影、嵌套约束、严格 JSON/数值、来源及描述检查；省略、必填和 null 按确认决策处理。
- OpenAI/xAI Responses 适配器、连接绑定的 prepare/accept/cancel 桥接和本地 stdio MCP 启动入口。
- 超时、中止、dispose、并发及容量限制、token 冲突与重放、过期和断连清理。
- 81 组具备原始输入的语义场景、六种语言评测材料、API 联调脚本及桌面客户端手动配置指南。

## 本机实际通过

| 检查 | Node 22.12.0 / npm 10.9.9 | Node 24.19.0 / npm 11.9.0 |
|---|---|---|
| typecheck | 通过 | 通过 |
| lint 与导入边界/循环检查 | 通过 | 通过 |
| Vitest | 4 个文件，99 项通过 | 4 个文件，99 项通过 |
| build | 通过 | 通过 |
| 隔离安装包 smoke | 通过 | 通过 |

最低 Node 下 npm ci --engine-strict 通过。开发 lint 依赖固定为兼容该基线的版本；ESLint 9 上游停用提示仍存在，不影响当前已验证检查。Git diff 空白检查通过。

自动测试使用受控候选及 mock fetch，验证了 API 参数/返回/错误映射、共享流程与 MCP SDK 往返。安装包 smoke 实际打包并安装到临时独立项目，验证未安装可选 SDK 的根入口、公开导出/类型文件、运行时数据、API 适配器，以及子进程 stdio MCP 握手。它们不计为真实模型语义或桌面客户端通过。

缺少配置时，integration/evaluate 明确 NOT RUN、退出码 2；开发预览发布门禁明确拒绝发布。这两项是预期保护行为，不计入真实联调通过数。

语言快照的 9281 条记录已与 language-subtag-registry@0.4.2 完整比较，原始 registry.json 字节 SHA-256 核对通过。快照 metadata 说明摘要来源，并另存 recordsSha256；File-Date 为 2025-08-25。IANA 官网最新数据尚未在本环境重新获取。

## 本地待验证

真实 OpenAI/xAI 目标模型、Codex 桌面当前模型的实际触发与原文交接、81 组语义及多语言质量仍待验证。Windows/Linux CI 矩阵已配置；本机仅实际运行 Linux，不能声明 Windows 或桌面兼容已验收。

按 [本地配置与手动测试](local-testing.md) 执行：先单次 API 和三项联调检查，再接入桌面 MCP，最后运行编号案例和语言评测。所有语义结果先记 pending，按 evaluations/review-guidance.md 复核。失败记录保留 code/stage/issues/partialResult、原始材料及模型/客户端版本。

云环境的 install_script/start_skill 配置草稿已确认保存，使用 Node 22.12.0/npm 10.9.9，并记录安装、激活与检查步骤。草稿尚未发布；后续任务恢复尚未独立验证。未发布 npm 包或创建正式 release。
