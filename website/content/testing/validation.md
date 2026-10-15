# 兼容与支持

本文是V2使用文档。页脚显示完整适用包版本，包含必要版本后缀；结果与baseline的schemaVersion固定为 `2.0-draft.6`，与npm版本不同。

## 运行环境

| 项目 | 范围 |
|---|---|
| Node.js | ≥20.0.0，ESM |
| 平台 | Windows、macOS、Linux；Node20.0.0/24.x有跨平台自动化回归 |
| schema-dsl | 固定集成3.0.4；[支持矩阵](/guide/fields)列出规则边界 |
| CommonJS / 浏览器 | 不作为本版直接运行入口承诺 |
| 文档构建 | 维护站点需要Node24，与安装运行库的最低版本分开 |

## 接入状态

| 入口 | 状态与范围 |
|---|---|
| Native、stdio、SDK无关adapter | 有正式实现、安装包与自动化验证 |
| MCP协议 | 2025-06-18、2025-11-25、2026-07-28分别有SDK协议验证 |
| Codex CLI当前模型 | Linux、CLI0.162.1、gpt-6.1-sol配置已有真实接入与语义测试记录，完整验收尚未放行；实际协商2025-06-18 |
| Codex Desktop | 接入配置已提供；尚未独立验证真实客户端 |
| OpenAI / xAI Responses | 适配器已实现；错误/格式映射有自动化验证，真实供应商环境仍需单独验证 |
| Streamable HTTP | 通过已有服务嵌入adapter；认证/监听/逻辑session由应用管理，本文stdio示例不证明任意HTTP部署兼容 |
| 其他宿主 | 核心可组合；没有专用安装适配或客户端兼容保证 |

客户端支持目标与实测版本分别看待。更换模型/客户端版本、SDK或部署环境后，应验证自己的实际配置。结构检查不能保证所有自然语言正确，特定语料通过率不作为产品总体准确率承诺。

## 验证记录与范围

当前 main 的自动检查可查看 [CI 工作流](https://github.com/devcodex-labs/intent-runtime/actions/workflows/ci.yml)。下表是固定日期与版本的证据，不能据此认定以后每个提交或你的模型配置都已经验证。

| 记录日期 | 环境/方法 | 可支持的结论与证据 |
|---|---|---|
| 2026-10-15 | Linux/Windows/macOS × Node20.0.0/24.x；质量、文档共8项 | [已核实V2基线的CI](https://github.com/devcodex-labs/intent-runtime/actions/runs/38686149645)全部通过；证明工程回归和打包检查，不证明模型语义准确率 |
| 2026-10-15 | 实际MCP SDK2.3.1，三个声明协议 | [示例检查脚本](https://github.com/devcodex-labs/intent-runtime/blob/f36f11163c4cbe7ea492fd4673a6c81197a0d0aa/scripts/check-doc-examples.mjs)使用可控语言候选与真实核心/Validator；验证协议和字段链，不作为真实模型验收 |
| 2026-10-14 | Linux、Codex CLI0.162.1、gpt-6.1-sol、high配置 | 已执行当前模型prepare/accept及语义样本；原始交接/逐样本记录内部保留，完整验收尚未放行，不作总体准确率保证 |
| 尚未完成 | Codex Desktop与直接OpenAI/xAI供应商 | 配置/适配器实现及模拟故障检查不代表真实环境验收通过 |

完整模型验收和特定用户输入能否正确识别需要分开判断；反馈问题时提供实际模型与客户端版本。新示例的可控执行器检查不会提高真实语义验收通过率。

[完整结构场景](/api/response#完整场景与多轮材料)采用固定语言候选与正式核心，业务字段经过真实 Validator，覆盖要求、父子、多轮、事实、歧义和字段状态。它们用于核对契约，不是供应商模型准确率报告；无 Schema 的例子不额外套业务校验。

## 选择发行版本

本文对应V2；当前包的获取、明确版本与源码构建流程集中在[安装与版本](/guide/installation)。包的正式发行状态与上述测试状态分别看待。V1历史变更保存在[更新日志](https://github.com/devcodex-labs/intent-runtime/blob/main/CHANGELOG.md)。

当前文档不承诺仅安装包就自动处理宿主所有消息。默认识别timeoutMs=0，不加总期限；连接关闭、服务重启与宿主工具期限仍会影响调用。数小时/数日实际持续连接不由短时机制检查保证。

## 遇到问题

Codex先运行[doctor](/guide/installation)检查登记与启动；识别失败按[错误参考](/api/errors)检查code/stage。反馈问题时提供包/Node/客户端版本、系统、脱敏输入与安全错误摘要，勿包含凭据或完整敏感材料。可以通过[GitHub Issues](https://github.com/devcodex-labs/intent-runtime/issues)反馈。
