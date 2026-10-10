---
title: 测试、兼容与准确率
description: 区分确定性测试、真实 MCP 链路、目标客户端和模型语义验收，并按证据计算准确率。
---

# 测试、兼容与准确率

不同检查证明不同能力。单元测试通过、受控 MCP 往返成功、真实客户端调用和模型语义正确不能合并为一个“全部场景通过”。

## 兼容范围

| 项目 | 约束 / 验证方式 |
| --- | --- |
| 库运行时 | Node.js ≥20.0.0，ESM |
| 持续集成 | Linux、Windows、macOS × Node 20.0.0 / 24.x |
| Codex | 支持 CLI 与 Desktop 用户级 stdio MCP 注册，实际宿主分别手动验收 |
| API SDK | 可选 openai peer `>=6.49.0 <7` |
| OpenAI / xAI | 显式选择支持任务格式的模型，各路径独立联调 |
| 本文档站构建 | Node 24.x，独立 website 依赖；不提高库的运行版本 |

最新执行证据查看 [GitHub CI](https://github.com/devcodex-labs/intent-runtime/actions/workflows/ci.yml)。矩阵定义不等于每次运行成功，应检查你测试的精确提交。

## 确定性检查

在源码根目录执行：

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run smoke:validation
npm run smoke:release
npm run smoke:package
npm run smoke:installation
npm run smoke:maintenance
```

覆盖输入与输出契约、字段选择、Schema、来源、错误、并发、任务令牌、容量、取消、安装迁移和恢复等逻辑。打包测试安装实际 tarball，再检查公共入口和 MCP 服务。`smoke:release` 仅校验发布证据契约，运行它不会发布包，也不代表已经获得发布验收。

## 无密钥 MCP 链路

```bash
npm run test:mcp
```

真实 SDK 客户端连接独立 stdio 服务进程，运行 18 组协议与资源场景，候选是受控数据。这证明生产入口、工具交接与校验链路工作，不调用真实模型，也不启动 Codex Desktop。

## 真实语义与准确率

**当前没有可作为生产指标的真实模型意图识别准确率。** 不能用单元测试通过率、结构合法率或助手自评率替代它。

评测材料包括默认 95 条展开用例（89 条语义变体、6 条语言材料）和补充 24 条，总计 119 条；补充中包含原输入重测，不能把每条都称为独立新样本。来源和评审方法见[评测工具](https://github.com/devcodex-labs/intent-runtime/tree/main/evaluations)。

真实评测按以下步骤执行：

1. 冻结输入、Schema、预期语义和 Prompt/源码版本。
2. OpenAI、xAI 与目标 Codex 路径分别实际生成候选，保存原始工具往返和结果。
3. 独立逐例评审动作、对象、否定、确认、条件、上下文、值和来源；有分歧时人工裁决。
4. 单列未执行与未裁决样本，报告已裁决请求的完整语义通过率、动作 precision/recall、状态和字段正确率。
5. 关键场景重复请求以测稳定性，修复前后的错误都保留。使用新的领域材料作留出集。

输入拒绝不混入意图识别准确率分母；部分字段正确也不能算完整请求通过。计划中的通过率目标是验收门槛，不能写成已测准确率。

发布验收逐一记录展开后的 `id/variant` 键，例如 `S-62/omitted` 和 `S-62/empty` 分别评审。验收清单中的 `reviews.semantics.reviewedCaseKeys` 必须包含全部 113 个语义键，`reviews.multilingual.reviewedCaseKeys` 必须包含全部 6 个语言键，不能只记录父用例编号，也不能以重复记录补足数量。

从源码执行 `npm publish` 时，发布钩子会核对项目外的已评审验收材料、精确提交和成功的跨平台 CI；开发预览版本会被拒绝。`npm pack` 仍可用于本地客户端测试。正式发布还需要仓库的发布环境审批和发布授权。

## API 评测命令

设置 `INTENT_PROVIDER`、`INTENT_MODEL` 和对应 `INTENT_OPENAI_KEY` 或 `INTENT_XAI_KEY` 后执行：

```bash
npm run evaluate
npm run evaluate -- --languages
npm run evaluate -- --all --repeat 5
```

这些命令会实际请求模型并产生费用。结果的 semanticReview 初始为 pending，退出码 0 不代表独立语义验收通过。Codex 需要按[客户端流程](../integrations/codex-cli.md)保存真实往返，API runner 不能替代它。

## 响应耗时

```bash
npm run build
node evaluations/benchmark-mcp.mjs
```

基准记录受控候选下的启动、冷请求和预热后的 MCP 响应，排除了模型生成、网络和客户端调度。真实端到端延迟应在目标模型下记录每阶段耗时、parse 总耗时、p50/p95、修复率和费用，按模型和路径分组。

## 结果保存

评测产物默认放在项目同级 `intent-runtime-results/runs/`，每次使用新运行目录。可用 `INTENT_EVALUATION_DIR` 指定其他项目外路径。报告、真实业务材料、凭据和运行日志不进入源码仓库或公开文档站。

## 中文文档验收

本轮先交付中文。请核对安装步骤、客户端配置、默认值、术语和示例；中文确认后再翻译英文，避免同时维护两份尚未定稿的内容。
