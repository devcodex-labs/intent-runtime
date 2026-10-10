---
title: Schema 与字段选择
description: 用 schema-dsl 描述业务字段，区分全量、部分和空字段选择，并处理缺失与来源问题。
---

# Schema 与字段选择

扩展字段放在结果的 `data` 中。构造实例时提供对象 Schema，模型根据所选字段与业务描述生成 data 候选，本地逻辑校验结构和来源。

## 描述业务含义

```js
import { s } from "schema-dsl/pure";

const schema = s({
  orderId: s("string!").description("当前请求中的订单编号，原样保留前导零，不猜测。"),
  note: s("string").description("请求明确给出的备注；未提供时省略。"),
});
```

类型约束说明值能否表示，description 说明业务含义。必填字段在材料不足时应反馈问题，不能通过猜测填满。编号等精确值建议使用 string。

也可以直接传入 JSON Schema。模块支持下表所述的 Draft-7 子集，顶层属性是字段选择单位。不支持的定义会在构造实例时返回 `SCHEMA_UNSUPPORTED`；超出资源限制则返回 `LIMIT_EXCEEDED`。

## 支持的 Schema 范围

非空定义的根必须是带 `properties` 的 `type: "object"`。省略 schema 或传入 `{}` 表示没有扩展字段。

| 类别 | 支持的关键字 / 行为 |
| --- | --- |
| 对象 | `type`、`properties`、`required`、`additionalProperties` |
| 数组 | 单个对象或 boolean Schema 的 `items`、`minItems`、`maxItems`、`uniqueItems`；不支持数组形式的 tuple items |
| 字符串 | `minLength`、`maxLength`、`pattern`、`format`；DSL 的 `exactLength` 转换为长度上下界 |
| 数字 | `minimum`、`maximum`、`exclusiveMinimum`、`exclusiveMaximum`、`multipleOf` |
| 值与组合 | 嵌套字段中的 `enum`、`const`、`anyOf`、`oneOf`、`allOf`、`not`；组合数组长度为 1–16 |
| 注解 | `title`、`description`、`examples`、`default`、`$comment`；default 不自动填充数据 |
| 方言与标识 | `$schema` 只接受 Draft-7 的 http/https 标识；`$id` 接受后在内部移除，不注册引用 |
| DSL 元数据 | `_label`、`_customMessages` 接受后在内部移除，不参与业务校验 |

format 支持：`date`、`time`、`date-time`、`duration`、`uri`、`uri-reference`、`url`、`email`、`hostname`、`ipv4`、`ipv6`、`regex`、`uuid`、`json-pointer`、`relative-json-pointer`。

根对象不支持 `anyOf`、`oneOf`、`allOf`、`not`、`enum`、`const` 值约束，因为字段选择后无法保留这些约束的原始含义。可以把组合规则写在对应的顶层属性内部。

所有 `$ref` 都不支持，包括 `#/...` 本地引用；`definitions`、`$defs`、条件关键字和未列出的其他关键字也不支持。定义需为可复制的 JSON 数据，不包含函数、访问器、循环引用或可执行转换。boolean Schema 可用于嵌套节点，根定义仍需为对象。

例如，下面的本地引用会被拒绝，即使引用目标在同一份 Schema 中：

```json
{
  "type": "object",
  "properties": {
    "orderId": { "type": "string" },
    "relatedOrderId": { "$ref": "#/properties/orderId" }
  }
}
```

直接在 relatedOrderId 中写对应的字段定义即可。校验不会自动转换类型、插入 default 或删除额外属性；编号 `"000123"` 不会被转成数值，缺失必填值也不会用默认值替代。

## 三种 fields

| 请求 | data 阶段 |
| --- | --- |
| 省略 `fields` | 尝试所有已定义的顶层扩展字段 |
| `fields: ["orderId"]` | 只处理所选字段 |
| `fields: []` | 跳过扩展，返回完整默认意图结果和空 data |

选择未知字段会得到 `UNKNOWN_FIELD`。选择嵌套叶值不替代选择对应顶层字段。字段选择改变扩展范围，不应删减默认动作、要求或禁止事项。

所选 data 的根对象只允许所选属性，required 只保留其中选中的必填字段。字段内部的约束保持不变；例如未选择必填 orderId 不会阻止只提取 note，选择 orderId 后它仍是必填。

### 根描述与关系材料

字段选择不会取消适用的根 description。只选择 endTime 时，如果定义要求“结束时间不得早于开始时间”，仍需依据原材料里的开始时间核对关系。未选 startTime 可以作为来源材料，但不能返回到 data；缺少关系材料应反馈 DATA_DEPENDENCY_MISSING 等问题，不能凭未选择该字段跳过约束或猜值。

模型需为适用根描述给出 `/data` 的 descriptionChecks；本地验证检查结论结构与引用，实际关系含义仍需语义复核。完整 Schema、成功候选、失败候选和响应见[部分字段与跨字段约束](../examples/context-fields.md#部分字段与跨字段约束)。

## 来源与完整性

data 候选除了 `data`，还包含 `evidence`、`descriptionChecks`、`fieldResults` 和 `issues`。API 路径自动处理它们；MCP 的当前模型按实际返回的任务格式生成。最终成功结果只暴露公共 `data` 字段，而错误可暴露相关 issues。

完整 data 候选、来源格式与字段结论枚举见[任务与候选](../api/bridge-mcp.md#data-候选)，最终 data 的省略/null 规则见[响应结构](../api/response.md#data-的省略与-null)。

包含可选省略、null、false、0、空容器及嵌套明细的完整例子见[多订单与不同值类型](../examples/orders.md#多订单与不同值类型)。

每个返回叶值需要对应输入或显式上下文的来源，每个所选字段要有提取结论。精确引用能够证明片段存在，仍不能单独证明引用含义适合该字段。

## 提取失败

必要字段缺失、多个候选无法确定、相互冲突、数量不符、值不可表示或描述约束不满足，可能产生 `DATA_EXTRACTION_FAILED`，直接反馈材料或定义问题。

缺少来源证据、引用片段不在声明来源中、精确值与引用不一致，则属于 `MODEL_OUTPUT_INVALID`。完整候选可尝试修复，修复用尽后返回该错误；它们不作为真实业务信息缺失处理。

处理错误时记录 `issues`，可用 `partialResult` 显示已经验证的默认意图。该部分结果不代表业务字段提取成功，下一步可澄清材料或修正定义后重新识别。参见[错误与部分结果](../api/errors.md)。
