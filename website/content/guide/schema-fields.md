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

也可以传入等价 JSON Schema。当前支持的关键字以源码校验和 `SCHEMA_UNSUPPORTED` 反馈为准；远程引用、函数和可执行 Schema 不属于可传递的定义。顶层属性是字段选择单位。

## 三种 fields

| 请求 | data 阶段 |
| --- | --- |
| 省略 `fields` | 尝试所有已定义的顶层扩展字段 |
| `fields: ["orderId"]` | 只处理所选字段 |
| `fields: []` | 跳过扩展，返回完整默认意图结果和空 data |

选择未知字段会得到 `UNKNOWN_FIELD`。选择嵌套叶值不替代选择对应顶层字段。字段选择改变扩展范围，不应删减默认动作、要求或禁止事项。

## 来源与完整性

data 候选除了 `data`，还包含 `evidence`、`descriptionChecks`、`fieldResults` 和 `issues`。API 路径自动处理它们；MCP 的当前模型按实际返回的任务格式生成。最终成功结果只暴露公共 `data` 字段，而错误可暴露相关 issues。

每个返回叶值需要对应输入或显式上下文的来源，每个所选字段要有提取结论。精确引用能够证明片段存在，仍不能单独证明引用含义适合该字段。

## 提取失败

必要字段缺失、多个候选无法确定、相互冲突、数量不符、值不可表示、描述约束违反或来源无效，都可能产生 `DATA_EXTRACTION_FAILED`。

处理错误时记录 `issues`，可用 `partialResult` 显示已经验证的默认意图。该部分结果不代表业务字段提取成功，下一步可澄清材料或修正定义后重新识别。参见[错误与部分结果](../api/errors.md)。
