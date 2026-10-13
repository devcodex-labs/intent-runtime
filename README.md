# Intent Runtime

将调用方提供的用户意图结构化，供 Node.js 应用与标准 MCP tools 使用。识别目标、约束、父子关系、本轮变更和 Schema 字段；只理解显式提供的材料。应用负责业务工具、授权、执行与状态。

要求 Node.js ≥20.0.0、ESM、真实 `schema-dsl@3.0.4`。使用包含这些 V2 导出入口的发行包；本地验收可构建并在空目录安装 tarball。成功结果与 baseline 版本为 `2.0-draft.6`。

```js
import {Intent} from '@devcodex/intent-runtime';
import {createApiExecutor} from '@devcodex/intent-runtime/adapters/api';
import {s} from 'schema-dsl/pure';
const apiKey = process.env.INTENT_API_KEY, model = process.env.INTENT_MODEL;
if (!apiKey || !model) throw new Error('配置环境中的模型名和凭据');
const intent = new Intent({
  language: 'zh-CN', executor: createApiExecutor({provider: 'openai', apiKey, model}),
  schema: s({orderId: s('string!').description('明确订单编号，保留前导零')}),
});
try {
  const result = await intent.parse({input: '查询订单000123，不取消订单', fields: ['orderId']});
  console.log(result.effective.intents[0]?.inputs.orderId);
} finally {await intent.dispose();}
```

`fields` 默认 `[]`，仍识别意图。完整目标只存于 `effective`；`turn.intentIds/changes` 描述本轮。操作参数归所属意图 `inputs`，无操作的所选事实归 `turn.facts`。自由 JSON Context 不要求固定消息格式；多轮显式传 Context 或上次 effective 作为 baseline，没有隐式记忆。`complete` 不表示字段齐全或执行授权。

三种接入：Native `Intent.parse`；`/adapters/api` 的 OpenAI/xAI Responses 执行器；`/mcp` 的 SDK 无关 adapter，可配置到已有 MCP tools。executor 暴露 `intent_parse`；host 暴露 `intent_prepare/accept/cancel`，当前宿主按任务生成候选，服务端使用同一核心验证，不调用额外模型。

独立服务使用 `intent-runtime-mcp --config /absolute/path/intent.host.config.mjs`。全局安装后显式登记：

```bash
npm install -g @devcodex/intent-runtime
intent-runtime setup --host codex --config /absolute/path/intent.host.config.mjs
```

普通安装不改变宿主。`intent-runtime doctor --host codex` 只读诊断，`doctor --repair` 恢复拥有记录的缺项，`clean --host codex` 清理未被用户修改的登记。默认识别 `timeoutMs: 0` 无时间期限；host 记录是有容量边界的短期交接，不能代替应用任务存储。

中文站点源码：[`website/content`](website/content/guide/introduction.md)，[响应结构](website/content/api/response.md)、[配置](website/content/guide/configuration.md)、[MCP 接入](website/content/integrations/mcp.md)、[Codex 流程](website/content/integrations/codex.md)、[示例](examples/README.md)。历史版本仅保留在 [CHANGELOG](CHANGELOG.md)。

```bash
npm ci --ignore-scripts
npm run typecheck
npm run lint
npm test
npm run build
npm run check:package
```

`INTENT_TEST_DIR`、`INTENT_BUILD_DIR`、`INTENT_PACKAGE_CHECK_DIR` 可将产物放在项目之外。固定测试用候选隔离语言推理，真实调用业务 Validator；通过数不是准确率。真实供应商、Codex CLI/Desktop、多语言语义及跨平台 CI 必须分别记录，不能用 mock 或 Linux 服务端测试代替。

MIT，见 [LICENSE](LICENSE)。
