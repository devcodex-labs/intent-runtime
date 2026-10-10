# 可追溯的测试与评测

`cases/semantics.jsonl` 包含 S-01—S-81，展开变体为 89 个用例；`cases/languages.jsonl` 包含 6 个语言用例，合计 95 个。`cases.mjs` 生成唯一清单，`schemas.mjs` 提供 API 和 MCP 共用的定义。语义标准见 [review-guidance.md](review-guidance.md)。

`cases/additional.jsonl` 增加 X-01—X-24，完整清单为 119 条，其中 X-01/X-02 重测原撤回输入，不能计为独立新样本。默认 95 条清单保持不变。

报告、评分记录和原始运行产物统一保存在项目外。默认位置为仓库同级的 `<仓库目录名>-results/runs/`；本项目通常是 `../intent-runtime-results/runs/`，Windows 对应 `D:\Worker\intent-runtime-results\runs\`。每次运行使用新的时间戳目录或文件。可用 `INTENT_EVALUATION_DIR` 指定其他外部目录；显式输出路径也必须位于项目外。仓库保留可复用的工具、用例和评审方法。

## 无密钥的协议回归

```bash
npm ci
npm run test:mcp
```

使用真实 SDK 客户端和独立 stdio 服务进程，测试 18 组协议及资源场景。启动的是 `mcp-protocol-server.mjs` 专用测试入口，复用正式服务的 `serveIntentMcp`；正式 MCP CLI 的打包与启动由 smoke:package 等另行检查。候选是受控测试数据，不调用模型 API 或真实 Codex 客户端。结果在外部运行目录中的 `<时间戳>-protocol/`；CI 在 Windows/Linux/macOS × Node 20.0.0/24.x 执行该脚本，实际运行结果以精确提交的 CI 为准。

## 当前助手逐例生成候选

```bash
npm run build
node evaluations/mcp-session.mjs ../intent-runtime-results/runs/<新的运行目录>
# 单独执行补充 24 条，控制命令使用 X-01/default 等 key
node evaluations/mcp-session.mjs ../intent-runtime-results/runs/<新的补充目录> additional
```

驱动接受逐行 JSON 控制命令，连接真实生产 MCP 入口并打印实际 task。助手先读取该回复和任务 instructions/format，再生成完整候选；每条 `accept` 自动使用该用例最新的真实 jobId/stepToken。

```json
{"operation":"prepare","keys":["S-01/default"]}
{"operation":"accept","submissions":[{"key":"S-01/default","candidate":{"normalizedInput":"Analyze the cause of the login failure.","primaryIntent":"Analyze login failure","requirements":[],"prohibitions":[],"intents":[{"action":"analyze","target":"Cause of login failure","requirements":[],"blockers":{"clarificationReason":null,"questions":[],"confirmationReason":null,"conditionReason":null}}]}}]}
{"operation":"review","reviews":[{"key":"S-01/default","status":"pass","reason":"对照实际原文检查：只分析原因，没有添加修复动作。"}]}
{"operation":"summary"}
{"operation":"close"}
```

有 data 或 repair task 时，读取后继续 accept。result 表示成功；error 需按[任务错误处理](https://devcodex-labs.github.io/intent-runtime/api/bridge-mcp.html#调用错误与任务状态)判断是否终止，容量拒绝等可能保留当前任务。停止识别时 cancel 或关闭连接。澄清问题是 `{question, options}` 对象。建议每批不超过 10 条；默认活动任务上限 32，任务不按时间自动过期，但需要保持原 MCP 连接。原始 instructions、格式、参数、候选摘要和回复写入 `transcript.jsonl`。控制台仅缩略相同 instructions，原始记录完整保留。

驱动不自动生成候选，不自动批准语义，也不连接 Codex 桌面客户端。`review` 始终记录为当前助手自评、`independent:false`。`summary.json` 保留 `independentReview:pending`。

## 审计与回放

完成 95 条后检查记录完整性、原文、令牌来源、字段选择、关键场景结果和预期错误：

```bash
node evaluations/audit-mcp.mjs ../intent-runtime-results/runs/<完整运行目录>
node evaluations/mcp-replay.mjs ../intent-runtime-results/runs/<完整运行目录> ../intent-runtime-results/runs/<新的回放目录>
```

回放在新 MCP 连接上重新 prepare，使用新令牌提交原来保存的候选，逐条比较 task 内容和最终结果。它验证代码回归及 Node 兼容性，不产生新模型推理或新语义评分。审计脚本针对当前 95 条清单；新增用例后需同步预期错误和完整性检查。

原始结果不进入项目或 Git，按需在外部目录单独归档；每次运行使用新目录以保留失败和修复前后的证据。

补充 24 条使用 `node evaluations/audit-additional.mjs ../intent-runtime-results/runs/<补充目录>` 核对原始任务、真实令牌、摘要及预先定义的动作/状态/data/issues；它只验证列出的维度。所有用例的整体语义仍需独立评审。回放要求 instructions 完全相同，Prompt 修订后不能把旧记录当作同版本回归，不能静默忽略摘要差异。

补充记录回放：`node evaluations/mcp-replay.mjs ../intent-runtime-results/runs/<补充目录> ../intent-runtime-results/runs/<新的回放目录> additional`。第四个参数指定数据集，默认仍为原 95 条；源 manifest 必须匹配。

## 本地响应基准及语义防护探查

```bash
npm run build
node evaluations/benchmark-mcp.mjs
node evaluations/probe-semantic-guards.mjs
```

基准使用受控候选、真实 SDK stdio 连接；6 种场景、516 次计时请求，另记启动、冷请求和预热。它排除模型生成、网络和桌面调度，不能当作生产端到端延迟。探查故意提交三种语义错误的合法候选，验证结构/原文引用校验的边界；退出 0 表示边界已复现，不能解读为三条正确识别。未来若增强语义校验，需同步更新探查的预期。

## 独立 API 评测

设置环境变量 `INTENT_PROVIDER`（`openai` 或 `xai`）、`INTENT_MODEL` 和对应的 `INTENT_OPENAI_KEY` 或 `INTENT_XAI_KEY`，然后运行 `npm run evaluate` 与 `npm run evaluate -- --languages`。API 适配器需要安装可选依赖 `openai`；从源码运行 `npm ci` 已包含它。每个模型路径独立记录；退出码正常不代表语义已验收。

`--additional` 运行补充 24 条；`--all` 运行全部 119 条；`--repeat 5` 让每例重新请求五次，也可配合 `--case X-01 --additional`。每次真实 API 请求记录完整任务、instructions SHA-256、候选回复及阶段耗时，并记录 parse 总耗时。每条结束立即写入外部 JSONL，密钥和 HTTP 请求头不进入记录。输出可能包含原始业务材料，按本地数据管理要求保存。预设动作/状态/data/issues 的比对只覆盖指定维度，整体语义仍记 pending；按独立裁决结果计算准确率。
