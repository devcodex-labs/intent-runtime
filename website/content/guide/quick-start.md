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

要求Node.js≥20.0.0、ESM。先按[安装与版本](/guide/installation#获取当前-v2-包)获取V2的tgz并安装到应用目录。当前npm latest仍为V1，直接省略版本安装不能得到本文入口。

本文先识别目标与约束，不配置业务Schema。需要订单编号等结构化参数时，再运行[订单字段示例](/examples/index#订单字段提取)。

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

<!-- example: examples/api/basic.mjs -->
```js
import {Intent, IntentError} from '@devcodex/intent-runtime';
import {createApiExecutor} from '@devcodex/intent-runtime/adapters/api';

const apiKey = process.env.INTENT_API_KEY, model = process.env.INTENT_MODEL;
if (!apiKey || !model) throw new Error('Set INTENT_API_KEY and INTENT_MODEL in your environment.');
const intent = new Intent({language: 'zh-CN', executor: createApiExecutor({provider: 'openai', apiKey, model})});
try {
  const result = await intent.parse({input: '查询订单000123，不取消订单'});
  console.log(JSON.stringify(result, null, 2));
  // Read goals and constraints from effective; no order query is executed.
  console.log('目标：', result.effective.intents.map(node => node.goal));
  console.log('需要澄清：', result.issues.map(issue => issue.message));
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

本例的理解结果应保留查询目标和禁止取消的约束。订单编号会出现在自然语言目标中；只有另行配置Schema并选择orderId后，才提取到inputs。完整文本与生成ID可以变化。

- effective.intents是目标树；同时读取全局与各目标的constraints。
- issues说明歧义、缺失或冲突；先补充材料，不自行执行某个候选。
- fields默认[]，省略它仍识别意图，但不新增业务字段提取。
- complete不代表字段齐全、授权或业务已执行。程序不会查询或取消订单。

下一步读[如何读取结果](/guide/results)，或运行[订单字段和多轮修改](/examples/index)的完整示例。需要其他模型供应商时查[模型接入](/integrations/api)，调用失败时查[错误与恢复](/api/errors)。
