# 可追溯的测试与评测

`cases/semantics.jsonl` 包含 S-01—S-81，展开变体为 89 个用例；`cases/languages.jsonl` 包含 6 个语言用例，合计 95 个。`cases.mjs` 生成唯一清单，`schemas.mjs` 提供 API 和 MCP 共用的定义。语义标准见 [review-guidance.md](review-guidance.md)。

## 无密钥的协议回归

```bash
npm ci
npm run test:mcp
```

使用真实 SDK 客户端和独立 stdio 服务进程，测试 18 组协议及资源场景。候选是受控测试数据，不调用模型 API。结果在 `evaluations/results/protocol/`；CI 在 Windows/Linux、两种 Node 版本执行该脚本，实际运行结果以 CI 为准。

## 当前助手逐例生成候选

```bash
npm run build
node evaluations/mcp-session.mjs evaluations/results/<新的运行目录>
```

驱动接受逐行 JSON 控制命令，连接真实生产 MCP 入口并打印实际 task。助手先读取该回复和任务 instructions/format，再生成完整候选；每条 `accept` 自动使用该用例最新的真实 jobId/stepToken。

```json
{"operation":"prepare","keys":["S-01/default"]}
{"operation":"accept","submissions":[{"key":"S-01/default","candidate":{"normalizedInput":"Analyze the cause of the login failure.","primaryIntent":"Analyze login failure","requirements":[],"prohibitions":[],"intents":[{"action":"analyze","target":"Cause of login failure","requirements":[],"blockers":{"clarificationReason":null,"questions":[],"confirmationReason":null,"conditionReason":null}}]}}]}
{"operation":"review","reviews":[{"key":"S-01/default","status":"pass","reason":"对照实际原文检查：只分析原因，没有添加修复动作。"}]}
{"operation":"summary"}
{"operation":"close"}
```

有 data 或 repair task 时，读取后继续 accept，直到 result/error。澄清问题是 `{question, options}` 对象。建议每批不超过 10 条并在有效期内完成；默认活动任务上限 32。原始 instructions、格式、参数、候选摘要和回复写入 `transcript.jsonl`。控制台仅缩略相同 instructions，原始记录完整保留。

驱动不自动生成候选，不自动批准语义，也不连接 Codex 桌面客户端。`review` 始终记录为当前助手自评、`independent:false`。`summary.json` 保留 `independentReview:pending`。

## 审计与回放

完成 95 条后检查记录完整性、原文、令牌来源、字段选择、关键场景结果和预期错误：

```bash
node evaluations/audit-mcp.mjs evaluations/results/<完整运行目录>
node evaluations/mcp-replay.mjs evaluations/results/<完整运行目录> evaluations/results/<新的回放目录>
```

回放在新 MCP 连接上重新 prepare，使用新令牌提交原来保存的候选，逐条比较 task 内容和最终结果。它验证代码回归及 Node 兼容性，不产生新模型推理或新语义评分。审计脚本针对当前 95 条清单；新增用例后需同步预期错误和完整性检查。

原始结果目录由 `.gitignore` 排除，按需单独归档；每次运行使用新目录以保留失败和修复前后的证据。

## 独立 API 评测

按 [本地测试](../docs/local-testing.md) 设置 provider/model/key，然后运行 `npm run evaluate` 与 `npm run evaluate -- --languages`。每个模型路径独立记录；退出码正常不代表语义已验收。
