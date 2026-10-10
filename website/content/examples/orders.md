---
title: 订单字段提取
description: 用 schema-dsl 定义订单编号，保留前导零并处理扩展字段缺失。
---

# 订单字段提取

编号 `000123` 是业务标识，不能转成数字 `123`。把它声明为 string，并明确描述原样保留的要求。

## API 示例

```js
import { s } from "schema-dsl/pure";
import { Intent, IntentParseError } from "@devcodex/intent-runtime";
import { createApiExecutor } from "@devcodex/intent-runtime/adapters/api";

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

完整七字段输出见[业务字段提取成功](../api/response.md#业务字段提取成功)，必填值缺失时的完整 issues 与 partialResult 见[失败示例](../api/errors.md#完整失败示例)。

## MCP 示例

业务配置参考[中文订单实例](../guide/configuration.md#定义中文订单实例)。向 `intent_prepare` 提交：

```json
{ "instance": "orders", "input": "查询订单 000123", "fields": ["orderId"] }
```

接下来的 core 和 data 候选由当前模型按实际任务生成。不要直接把预期 `data` 当作 accept 候选；data 任务还要求 evidence、字段结论和描述检查。

完整候选与来源字段见 [Bridge 与 MCP：任务与候选](../api/bridge-mcp.md#任务与候选)。SDK 客户端从 `structuredContent.result.data.orderId` 读取最终值；程序内 Bridge 从 `reply.result.data.orderId` 读取。

## 必填信息缺失

输入只有“查询这个订单”且 context 没有订单编号时，不能猜测 `orderId`。提取失败可能返回 `DATA_EXTRACTION_FAILED` 与 `DATA_REQUIRED_MISSING` 等 issue。保留 partialResult，用澄清获得编号后重新识别。

## 只理解动作

同一个订单实例使用 `fields: []` 时，跳过订单号提取，返回完整默认意图与空 data。必填字段不会因此阻止默认意图识别。

## 多订单与不同值类型

下面把明细数组与几种易混淆的值组合在一例中。将此 JSON Schema 传入 Intent 的 schema，或配置为 MCP 命名实例的 schema；它是独立于前面单个 orderId 定义的完整例子。

<!-- business-schema: data-values -->
```json
{
  "type": "object",
  "description": "各条明细保留订单编号与数量的对应关系。",
  "properties": {
    "urgent": { "type": "boolean" },
    "budget": { "type": "number" },
    "note": { "type": ["string", "null"] },
    "tags": { "type": "array", "items": { "type": "string" } },
    "metadata": { "type": "object", "properties": {}, "additionalProperties": false },
    "orders": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "orderId": { "type": "string" },
          "quantity": { "type": "integer" }
        },
        "required": ["orderId", "quantity"],
        "additionalProperties": false
      }
    },
    "deliveryNote": { "type": "string", "default": "默认配送说明" }
  },
  "required": ["urgent", "budget", "note", "tags", "metadata", "orders"],
  "additionalProperties": false
}
```

parse 请求省略 fields，尝试全部七个顶层字段。调用 MCP prepare 时另外指定实际配置的 instance 名：

<!-- parse-request: data-values -->
```json
{
  "input": "查询订单000123数量2、000124数量1。加急标志为false，预算为0，备注值为null，标签为空数组，附加信息为空对象；未提供配送说明。"
}
```

下面是完整 data 候选；它仍须通过 intent_accept 或 API 流水线验证，不能直接当作最终响应。false、0、null 和空容器均引用明确材料；编号采用 exact，其他值用有依据的 semantic 映射。每个数组叶值使用相应 JSON Pointer，配送说明即使被省略也有字段结论。

<!-- model-candidate: data-values -->
```json
{
  "data": {
    "urgent": false,
    "budget": 0,
    "note": null,
    "tags": [],
    "metadata": {},
    "orders": [
      { "orderId": "000123", "quantity": 2 },
      { "orderId": "000124", "quantity": 1 }
    ]
  },
  "evidence": [
    { "path": "/data/urgent", "mode": "semantic", "sources": [{ "sourceId": "input", "quote": "加急标志为false" }] },
    { "path": "/data/budget", "mode": "semantic", "sources": [{ "sourceId": "input", "quote": "预算为0" }] },
    { "path": "/data/note", "mode": "semantic", "sources": [{ "sourceId": "input", "quote": "备注值为null" }] },
    { "path": "/data/tags", "mode": "semantic", "sources": [{ "sourceId": "input", "quote": "标签为空数组" }] },
    { "path": "/data/metadata", "mode": "semantic", "sources": [{ "sourceId": "input", "quote": "附加信息为空对象" }] },
    { "path": "/data/orders/0/orderId", "mode": "exact", "sources": [{ "sourceId": "input", "quote": "000123" }] },
    { "path": "/data/orders/0/quantity", "mode": "semantic", "sources": [{ "sourceId": "input", "quote": "000123数量2" }] },
    { "path": "/data/orders/1/orderId", "mode": "exact", "sources": [{ "sourceId": "input", "quote": "000124" }] },
    { "path": "/data/orders/1/quantity", "mode": "semantic", "sources": [{ "sourceId": "input", "quote": "000124数量1" }] }
  ],
  "descriptionChecks": [
    { "path": "/data", "verdict": "satisfied", "explanation": "两条明细分别保留编号与对应数量。", "sources": [{ "sourceId": "input", "quote": "订单000123数量2、000124数量1" }] }
  ],
  "fieldResults": [
    { "path": "/data/urgent", "status": "extracted", "explanation": "明确提供false。" },
    { "path": "/data/budget", "status": "extracted", "explanation": "明确提供0。" },
    { "path": "/data/note", "status": "extracted", "explanation": "Schema允许null，原文明确空值。" },
    { "path": "/data/tags", "status": "extracted", "explanation": "明确提供空数组。" },
    { "path": "/data/metadata", "status": "extracted", "explanation": "明确提供空对象。" },
    { "path": "/data/orders", "status": "extracted", "explanation": "两个编号及数量分别保留。" },
    { "path": "/data/deliveryNote", "status": "not_provided", "explanation": "未提供配送说明，不填入Schema default。" }
  ],
  "issues": []
}
```

验证后的[完整 IntentResult](../api/response.md#可选字段空值与嵌套业务数据)只保留 data，deliveryNote 省略。缺少明确空值材料时也不能把 note 补成 null；缺少值不等于 false、0 或空容器。引用命中和 satisfied 声明本身不证明语义正确，实际模型仍需按原材料复核。
