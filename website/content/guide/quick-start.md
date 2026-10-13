# 快速开始

运行要求：Node.js ≥20.0.0，ESM，真实 `schema-dsl@3.0.4`。使用包含本文 V2 导出的发行包；验收当前构建时可先 `npm run build`、`npm pack`，在空目录安装生成的 tarball。

```bash
npm install @devcodex/intent-runtime schema-dsl@3.0.4
```

```js
import {Intent} from '@devcodex/intent-runtime';
import {createApiExecutor} from '@devcodex/intent-runtime/adapters/api';
import {s} from 'schema-dsl/pure';
const apiKey = process.env.INTENT_API_KEY;
const model = process.env.INTENT_MODEL;
if (!apiKey || !model) throw new Error('请在环境中配置模型名与凭据');
const intent = new Intent({
  language: 'zh-CN',
  executor: createApiExecutor({provider: 'openai', apiKey, model}),
  schema: s({orderId: s('string!').description('用户明确给出的订单编号，保留前导零')}),
});
try {
  const result = await intent.parse({input: '查询订单000123，不取消订单', fields: ['orderId']});
  console.log(result.effective.intents[0]?.inputs.orderId);
} finally {await intent.dispose();}
```

`fields` 默认 `[]`；没有选择字段也会识别意图。`status=complete` 表示意图理解完整，不代表字段齐全或允许执行业务。读取 [响应结构](/api/response) 后再消费结果。
