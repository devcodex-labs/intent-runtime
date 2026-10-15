# 快速开始

选择与你的应用相符的接入方式：

<div className="intent-entry-matrix">

| 你要做什么 | 使用入口 | 模型来源 |
|---|---|---|
| 在 Node.js 应用中识别意图 | 本页示例 | 你的 API 或执行器 |
| 在 Codex 中调用 | [Codex 接入](/integrations/codex) | 当前模型或所配 API |
| 启动独立 MCP | [独立服务](/integrations/mcp#独立-stdio-服务) | 由服务配置决定 |
| 给已有 MCP 添加tools | [集成现有服务](/integrations/mcp#添加到已有-mcp-tools) | 当前宿主或所配 API |

</div>

## 1. 安装到项目

要求 Node.js **≥20.0.0**、ESM。本文适用于含V2导出的发行包；[兼容与支持](/testing/validation)列出适用版本。安装时核对包版本。

```bash
npm install @devcodex/intent-runtime schema-dsl@3.0.4
```

## 2. 配置模型

例子使用OpenAI Responses API。将 `INTENT_API_KEY` 和 `INTENT_MODEL` 设为你的凭据与可用模型名。这两个环境变量由应用读取，不是库自动读取的固定配置。xAI与自有网关见[模型接入](/integrations/api)。

PowerShell：

```powershell
$env:INTENT_API_KEY = "你的 API Key"
$env:INTENT_MODEL = "你的模型名称"
```

Bash：

```bash
export INTENT_API_KEY="你的 API Key"
export INTENT_MODEL="你的模型名称"
```

## 3. 保存并运行

将下例保存为安装依赖的项目中的 `parse.mjs`。包导入从文件位置解析。

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

## 4. 读取结果

正常结果应保留查询目标、禁止取消的约束，以及所属目标的字符串编号 `"000123"`。文本和生成ID可以变化。字段未确定时先读fieldResults与issues，不把缺失当作用户要求清空。

fields默认 `[]`：省略它仍识别意图，但不新增业务字段提取。只要意图时可不配置Schema，模型执行器仍需要。complete不代表字段齐全、授权或业务已执行。

继续阅读[完整响应](/api/response)、[配置参考](/guide/configuration)和[多轮对话](/guide/multi-turn)。
