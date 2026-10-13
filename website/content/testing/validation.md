# 验证范围

固定测试使用可控语言候选隔离模型推理，实际调用 schema-dsl 3.0.4，并经正式核心生成结果；不直接返回预期 Result。真实 SDK stdio 测试分别协商三个目标协议，并经过 prepare → accept → 实际业务 worker 的字段链。

配置维护在临时 HOME/CODEX_HOME 下测试，不修改真实用户配置。Node.js 20.0.0 与 24.x、Linux/Windows/macOS、空目录 tarball、Native/API/MCP/CLI 入口分别验证。CI 是跨平台证据来源；本地一次 Linux 测试不能替代其他平台。

真实供应商模型、Codex CLI/Desktop 当前模型来源、多语言语义和自然语言准确率需要独立记录。固定测试通过数、静态例子形状通过数、SDK 协商成功不能相加成为准确率，也不能证明宿主愿意完成候选交接。

仓库 `npm test` 运行固定回归；`npm run typecheck`、`npm run lint`、`npm run build` 和 `npm run check:package` 分别检查类型、边界、构建和安装包。测试/构建/模型记录可用 INTENT_TEST_DIR、INTENT_BUILD_DIR 或脚本的绝对输出路径放在项目之外。默认识别没有超时；维护启动诊断的有限等待只作用于维护流程。

发布须通过包版本/tag 对照、精确提交的跨平台 CI 与 V2 验收门禁；未运行项不记为通过。真实语义或目标宿主未验收时，不宣称发布验收收敛。
