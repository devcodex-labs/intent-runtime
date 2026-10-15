# Intent Runtime

将用户意图结构化，供 Node.js 应用与 MCP tools 使用。输入用户原文、相关上下文和可选字段定义，得到目标、约束、本轮变化、业务参数与需要澄清的问题。

应用负责业务工具、授权和执行；Intent Runtime只理解你提供的材料，不自动搜索项目、历史或外部系统。

## 选择接入方式

| 你的使用方式 | 入口 |
|---|---|
| Node.js 应用 | Intent.parse，配合API或自定义模型执行器 |
| Codex当前模型 | 全局安装后显式setup，使用prepare/accept/cancel |
| 独立MCP服务 | intent-runtime-mcp --config <绝对路径.mjs> |
| 已有MCP tools | /mcp的createIntentMcpAdapter，SDK继续管理传输与原路由 |

要求Node.js≥20.0.0、ESM、schema-dsl@3.0.4。本文描述V2入口，安装前确认所选发行版本包含这些导出；结果/baseline的schemaVersion为2.0-draft.6，与npm版本不同。

## 在应用中调用

```bash
npm install @devcodex/intent-runtime schema-dsl@3.0.4
```

按环境设置INTENT_API_KEY与INTENT_MODEL，在安装依赖的项目保存parse.mjs：

<!-- example: examples/api/parse.mjs -->
```js
import {Intent, IntentError} from '@devcodex/intent-runtime';
import {createApiExecutor} from '@devcodex/intent-runtime/adapters/api';
import {s} from 'schema-dsl/pure';

const apiKey = process.env.INTENT_API_KEY, model = process.env.INTENT_MODEL;
if (!apiKey || !model) throw new Error('Set INTENT_API_KEY and INTENT_MODEL in your environment.');
const intent = new Intent({language: 'zh-CN', executor: createApiExecutor({provider: 'openai', apiKey, model}), schema: s({orderId: s('string!').description('用户明确给出的订单编号，保留前导零')})});
function flatten(nodes) {return nodes.flatMap(node => [node, ...flatten(node.children)]);}
try {
  const result = await intent.parse({input: '查询订单000123，不取消订单', fields: ['orderId']});
  console.log(JSON.stringify(result, null, 2));
  const field = result.fieldResults.find(f => f.container === 'inputs' && f.field === 'orderId' && f.status === 'present');
  const owner = field && flatten(result.effective.intents).find(node => node.id === field.intentId);
  if (owner) console.log('识别到的订单编号：', owner.inputs.orderId);
  // 应用在这里决定如何处理结果；这个例子不查询或取消订单。
} catch (error) {
  if (!(error instanceof IntentError)) throw error;
  console.error(JSON.stringify(error.toJSON()));
  process.exitCode = 1;
} finally {await intent.dispose();}
```

```bash
node parse.mjs
```

fields默认[]，仍识别意图；操作参数归所属inputs，无操作的所选事实归turn.facts。读取所属fieldResults与issues后再使用值，complete不表示业务已经执行。多轮显式传context或baseline，事实、候选和问题按需另放context，实例没有隐式会话记忆。

## 接入 Codex

先按[完整配置说明](website/content/integrations/codex.md)保存可信intent.host.config.mjs。全局配置使用无包导入的JSON Schema，可放在没有本地node_modules的目录。替换真实绝对路径后：

```bash
npm install -g @devcodex/intent-runtime
intent-runtime setup --host codex --config /absolute/path/intent.host.config.mjs
```

重载客户端，明确要求只识别给定input。host复用当前模型，不需要额外API Key。普通安装不修改宿主；Skill不自动接管每条消息。

```bash
intent-runtime doctor --host codex
intent-runtime doctor --host codex --repair
intent-runtime clean --host codex
```

默认timeoutMs=0不加识别期限。doctor只读诊断，repair/clean保护用户修改。使用包导入的配置仍需本地依赖，不由全局目录自动解析。

## 使用文档

- [快速开始](website/content/guide/quick-start.md)与[配置参考](website/content/guide/configuration.md)
- [完整响应](website/content/api/response.md)与[多轮对话](website/content/guide/multi-turn.md)
- [MCP tools集成](website/content/integrations/mcp.md)、[Codex](website/content/integrations/codex.md)、[模型API/自定义执行器](website/content/integrations/api.md)
- [场景示例](website/content/examples/index.md)、[兼容与支持](website/content/testing/validation.md)、[示例文件](examples/README.md)

真实客户端/供应商与工程测试的验证范围分别列示，不将固定测试通过数当成模型准确率。历史版本变更见[CHANGELOG](CHANGELOG.md)。MIT，见[LICENSE](LICENSE)。
