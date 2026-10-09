# 本地配置与手动测试

目标 V1 已实现为开发预览。自动化检查验证合同和运输链路，真实模型语义及 Codex 桌面效果由你在本地验证。本指南不要求安装或使用 Codex CLI。

## 1. 准备工程

使用当前仓库和 Node.js >=22.12.0，推荐受支持版本的最新补丁。仓库内执行：

~~~bash
node --version
npm ci
npm run typecheck
npm run lint
npm test
npm run test:mcp
npm run build
npm run smoke:package
~~~

预期：检查退出码均为 0，测试确实执行；smoke:package 验证隔离安装、公开入口、可选依赖与 stdio MCP。Node 进程在完成后应退出，不留下 job 定时器阻塞。

已有原型入口不保留。新调用固定为 intent.parse({ input, fields, context })，包名保留 @devcodex-labs/intent-runtime。示例通过构建后的包自引用运行，无需先发布 npm。

## 2. OpenAI / xAI API 测试

npm ci 已安装开发所需 SDK；其他应用使用发布包时另行安装 openai peer。选择实际支持 Responses 严格 JSON Schema 的目标模型，模型名由你提供，模块不会猜测。

PowerShell：

~~~powershell
$env:INTENT_PROVIDER = "openai"
$env:INTENT_MODEL = "<实际模型名称>"
$key = Read-Host "OpenAI API Key" -AsSecureString
$env:INTENT_OPENAI_KEY = [System.Net.NetworkCredential]::new("", $key).Password
npm run test:integration
~~~

xAI 则设置 INTENT_PROVIDER 为 xai、INTENT_MODEL 为实际 Grok 模型名，使用同样方式设置 INTENT_XAI_KEY。

Bash：

~~~bash
export INTENT_PROVIDER=openai
export INTENT_MODEL='<实际模型名称>'
read -rs -p 'OpenAI API Key: ' INTENT_OPENAI_KEY
export INTENT_OPENAI_KEY
npm run test:integration
~~~

密钥只在本机环境提供，不加入源码。API 使用正式端点 api.openai.com / api.x.ai，没有把客户端登录凭据转成 API Key。

预期：三个真实功能检查执行——000123 被原样提取、fields: [] 返回完整默认字段而 data 为空、两订单遇到单值定义返回扩展失败且保留默认结果。脚本输出 provider/model、实际调用次数和待人工复核提示；它不宣称复杂语义全部通过。缺配置时明确 NOT RUN，退出码 2。

单次查看完整结果：

~~~bash
node examples/api/parse.mjs "请查询订单 000123，不要取消或修改订单，查询结果用中文。"
node examples/api/parse.mjs "请查询订单 000123，不要取消或修改订单，查询结果用中文。" --no-data
~~~

默认说明为英文，原文保持中文，交付要求仍应保留中文；不应出现取消或修改的正向意图。可设置 INTENT_LANGUAGE=zh-CN、ja、fr、ar 或 pt-BR 再检查说明语言及精确值。

如遇认证/限流/不支持格式/输出不完整，保留 code、stage、模型名和错误类别。不要删字段、换事实或放宽校验来得到成功。模型不支持严格输出时更换明确支持的目标模型并记录兼容结果。

## 3. Codex 桌面客户端 MCP

这条路径使用桌面当前模型，不需要 OpenAI/xAI API Key。

先记录桌面客户端名称、版本、操作系统及 Node 版本。构建后，将 examples/codex/intent.config.mjs 作为可信实例配置；它导出 orders 实例，使用默认英文和原生订单 Schema。

在客户端的 MCP 设置中添加本地 STDIO 服务：

- 名称：intent-runtime。
- command：Node 可执行文件的绝对路径（可用 PowerShell Get-Command node 或 Bash command -v node 查看）。
- args：第一个是仓库 dist/transports/mcp/main.js 的绝对路径，接着 --config，最后是 examples/codex/intent.config.mjs 的绝对路径。
- 保存并重连，确认 intent_prepare、intent_accept、intent_cancel 可见。
- 将 integrations/codex/workflow.md 的内容明确加入该任务的指令入口；仅存在文件不保证客户端读取它。

Windows config.toml 示例：

~~~toml
[mcp_servers.intent-runtime]
command = 'C:\Program Files\nodejs\node.exe'
args = [
  'D:\Worker\intent-runtime\dist\transports\mcp\main.js',
  '--config',
  'D:\Worker\intent-runtime\examples\codex\intent.config.mjs'
]
~~~

替换为自己的实际路径。TOML 单引号保留反斜杠，参数独立传递；不要合并成 shell 命令。Linux/macOS 使用对应绝对路径。

若客户端连接失败，先核对 Node、npm run build、配置文件及 SDK 安装。可运行启动命令检查 stderr 是否有启动错误；正常 stdio 服务是在等待 MCP 输入，终端没有业务输出不说明完整联调成功。

## 4. 在桌面当前模型中验证

明确向客户端提出以下解析任务：

> 只调用 intent-runtime 进行意图结构化，不执行订单操作。orders 实例，原始 input 为“请查询订单 000123，不要取消或修改订单，查询结果用中文。”，选择 orderId。严格按 prepare/accept 往返，展示最终 result。

观察：

1. prepare 参数中的 input 原样，fields=[orderId]。
2. prepare 返回 core task，工具调用结束。
3. 当前模型提交完整 core candidateText，accept 返回 data task 和新 token。
4. 当前模型提交包含来源、描述检查与 fieldResults 的 data 候选。
5. 最终 result.data.orderId 为 000123，说明默认英文，禁止修改/取消与中文交付要求都保留；没有实际查询订单。

再测：

| 场景 | 预期 |
|---|---|
| 同一输入 fields=[] | core 后直接 result，data={} |
| 查询订单 001 和 002，选择单值 orderId | error + 默认 partialResult，不任选编号 |
| 同 token、相同候选重交 | 重放同一运输回复，不重复推进 |
| 同 token 换候选 | BRIDGE_STEP_CONFLICT |
| 模型拒绝 / 无完整 JSON | cancel(outcome=refusal/incomplete)，明确失败 |
| input 含换行、引号、代码、反斜杠 | 收到的 input 与返回原文相等 |
| 服务重连/重启后提交旧 job | job 不可用，重新 prepare |

过期默认 10 分钟；程序化桥接可用小 jobTtlMs 单独验证。ready 不是实际权限或执行就绪证明。

## 5. 81 组语义与语言评测

先选一例，确认模型/Prompt 流程可用：

~~~bash
npm run evaluate -- --case S-03
npm run evaluate -- --case S-77
npm run evaluate -- --languages
~~~

再完整运行：

~~~bash
npm run evaluate
npm run evaluate -- --additional
# 全部 119 条逐例重新请求五次；会调用所配置 API
npm run evaluate -- --all --repeat 5
~~~

完整运行会主动调用所配置 API；每个变体通常 1 或 2 个阶段，每阶段最多修复一次。结果保存到项目同级的 intent-runtime-results/runs，不进入项目或 Git；Windows 本地默认为 D:\Worker\intent-runtime-results\runs。可通过 INTENT_EVALUATION_DIR 指定其他外部目录。所有语义判定为 pending，需要按 review-guidance.md 人工或独立 AI 复核；exit 0 不等于语义通过。

runner 记录 parse 总耗时以及每次 core/data/repair 模型请求耗时、完整任务、Prompt 摘要和模型回复。按这些记录计算真实模型路径的 p50/p95、修复率和独立语义评分；受控候选的毫秒基准不能替代它。评测报告和评分记录也保存在项目外。

OpenAI 与 xAI 分别运行并记录模型名。桌面路径使用相同案例逐例交接并留存工具记录，API runner 不能替代桌面联调。

请记录：系统/客户端/Node/SDK/模型版本、输入与上下文、字段选择、最终结果或序列化错误、调用数、耗时、复核结论和失败原文。发回失败案例时去掉密钥，保留业务材料中必要的精确值。

## 6. 当前待验证事项

真实 API 模型能力、桌面客户端触发和原文交接、Windows 兼容及目标模型独立语义验收须在实际目标环境验证。语言快照 File-Date 为 2025-08-25；若使用更新登记标签，可在本地运行 npm run registry:refresh，从 IANA 正式来源更新、审查差异，并重跑测试/构建/打包检查。
