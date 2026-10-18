# 兼容与支持

本文档适用于 **Intent Runtime V2**。本页列出运行环境、接入方式与兼容边界；安装步骤见[安装与版本](/zh/guide/installation)。结果与 baseline 的 `schemaVersion` 为 `2.0-draft.6`，用于识别结果格式，与 npm 包版本不同。

## 运行环境

| 项目 | 范围 |
|---|---|
| Node.js | ≥20.0.0，ESM |
| 平台 | Windows、macOS、Linux；Node20.0.0/24.x有跨平台自动化回归 |
| schema-dsl | 固定集成3.0.4；[支持矩阵](/zh/api/schema)列出规则边界 |
| CommonJS / 浏览器 | 不作为本版直接运行入口承诺 |

## 接入状态

| 入口 | 状态与范围 |
|---|---|
| Native、stdio、SDK无关adapter | 支持应用直接调用、独立stdio服务和嵌入已有MCP；共用同一识别核心 |
| MCP协议 | 2025-06-18、2025-11-25、2026-07-28分别有SDK协议验证 |
| Codex CLI当前模型 | host模式复用当前模型；Linux、CLI0.162.1、gpt-6.1-sol配置有真实接入记录，实际协商2025-06-18 |
| Codex Desktop | 接入配置已提供；尚未独立验证真实客户端 |
| 模型API | OpenAI / xAI Responses与显式Chat Completions；协议请求、回复与错误有自动化验证，真实供应商配置另验 |
| JS / TS | 应用支持ESM JavaScript与TypeScript；CLI加载.js/.mjs，TS配置先编译 |
| Streamable HTTP | 独立CLI可配监听地址、端口、路径与public-origin；有状态2025-06-18/2025-11-25有SDK调用和会话隔离测试，公开HTTPS Host/Origin与未知地址拒绝有请求级回归。已有服务可嵌入adapter；不代表任意远程认证或代理部署已验证 |
| 其他宿主 | 核心可组合；没有专用安装适配或客户端兼容保证 |

客户端支持目标与实测版本分别看待。更换模型/客户端版本、SDK或部署环境后，应验证自己的实际配置。结构检查不能保证所有自然语言正确，特定语料通过率不作为产品总体准确率承诺。

## 验证记录与范围

当前 main 的自动检查可查看 [CI 工作流](https://github.com/devcodex-labs/intent-runtime/actions/workflows/ci.yml)。下表是固定日期与版本的证据，不能据此认定以后每个提交或你的模型配置都已经验证。

| 记录日期 | 环境/方法 | 可支持的结论与证据 |
|---|---|---|
| 2026-10-15 | 提交71c774d；Linux/Windows/macOS × Node20.0.0/24.x；质量、文档共8项 | [该提交的CI](https://github.com/devcodex-labs/intent-runtime/actions/runs/38686149645)全部通过；证明历史工程回归和打包检查，不代表后续提交或模型语义验收 |
| 2026-10-15 | 实际MCP SDK2.3.1，三个声明协议 | [示例检查脚本](https://github.com/devcodex-labs/intent-runtime/blob/f36f11163c4cbe7ea492fd4673a6c81197a0d0aa/scripts/check-doc-examples.mjs)使用可控语言候选与真实核心/Validator；验证协议和字段链，不作为真实模型验收 |
| 2026-10-14 | Linux、Codex CLI0.162.1、gpt-6.1-sol、high配置 | 已执行当前模型prepare/accept及语义样本；该特定配置的记录不构成所有模型输入的准确率保证 |

特定用户输入能否正确识别仍需在实际模型配置下判断；反馈问题时提供实际模型与客户端版本。可控执行器检查用于验证结构和调用流程，不代表模型准确率。

[完整结构场景](/zh/api/response#完整场景与多轮材料)采用固定语言候选与正式核心，业务字段经过真实 Validator，覆盖要求、父子、多轮、事实、歧义和字段状态。它们用于核对契约，不是供应商模型准确率报告；无 Schema 的例子不额外套业务校验。

<a id="选择发行版本"></a>

## 更新与运行边界

在应用目录执行 `npm install @devcodex/intent-runtime` 更新。变更说明见[更新日志](https://github.com/devcodex-labs/intent-runtime/blob/main/CHANGELOG.md)；Codex全局命令的更新与登记维护见[安装维护](/zh/operations/codex)。

当前文档不承诺仅安装包就自动处理宿主所有消息。默认识别timeoutMs=0，不加总期限；连接关闭、服务重启与宿主工具期限仍会影响调用。数小时/数日实际持续连接不由短时机制检查保证。

## 遇到问题

Codex先按[安装维护](/zh/operations/codex)运行doctor检查登记与启动；识别失败按[错误参考](/zh/api/errors)检查code/stage。反馈问题时提供包/Node/客户端版本、系统、可复现输入与错误摘要，检查将要公开的材料是否包含凭据或敏感内容。可以通过[GitHub Issues](https://github.com/devcodex-labs/intent-runtime/issues)反馈。
