---
title: 订单字段提取
description: 用 schema-dsl 定义订单编号，保留前导零并处理扩展字段缺失。
---

# 订单字段提取

编号 `000123` 是业务标识，不能转成数字 `123`。把它声明为 string，并明确描述原样保留的要求。

## API 示例

```js
import { s } from "schema-dsl/pure";
import { Intent, IntentParseError } from "@devcodex-labs/intent-runtime";
import { createApiExecutor } from "@devcodex-labs/intent-runtime/adapters/api";

const apiKey = process.env.INTENT_OPENAI_KEY;
const model = process.env.INTENT_MODEL;
if (!apiKey || !model) throw new Error("请先配置目标模型和本地密钥");

const intent = new Intent({
  language: "zh-CN",
  schema: s({
    orderId: s("string!").description("当前有效请求中的订单编号，保留前导零，不猜测。"),
  }),
  executor: createApiExecutor({ provider: "openai", apiKey, model }),
});
try {
  const result = await intent.parse({ input: "查询订单 000123", fields: ["orderId"] });
  console.log(result.data.orderId);
} catch (error) {
  if (!(error instanceof IntentParseError)) throw error;
  console.error(error.code, error.issues);
  if (error.partialResult) console.log("已理解的默认意图", error.partialResult);
} finally {
  intent.dispose();
}
```

完整结果中的 `data.orderId` 应为 `"000123"`。这是应当核对的业务要求，并非每个模型都已经通过的验收声明。

## MCP 示例

业务配置参考[中文订单实例](../guide/configuration.md#定义中文订单实例)。向 `intent_prepare` 提交：

```json
{ "instance": "orders", "input": "查询订单 000123", "fields": ["orderId"] }
```

接下来的 core 和 data 候选由当前模型按实际任务生成。不要直接把预期 `data` 当作 accept 候选；data 任务还要求 evidence、字段结论和描述检查。

## 必填信息缺失

输入只有“查询这个订单”且 context 没有订单编号时，不能猜测 `orderId`。提取失败可能返回 `DATA_EXTRACTION_FAILED` 与 `DATA_REQUIRED_MISSING` 等 issue。保留 partialResult，用澄清获得编号后重新识别。

## 只理解动作

同一个订单实例使用 `fields: []` 时，跳过订单号提取，返回完整默认意图与空 data。必填字段不会因此阻止默认意图识别。
