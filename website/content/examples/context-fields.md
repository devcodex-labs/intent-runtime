---
title: 上下文与字段选择
description: 显式提供相关历史，处理撤回后的当前请求，并理解字段范围与默认意图的关系。
---

# 上下文与字段选择

模块只使用调用方明确提供的材料。context 适合表达前文已确定的对象、用户的修正，以及已完成动作；避免直接加入未经选择的完整会话。

## 撤回与修正

```json
{
  "input": "取消修改，先只分析原因。",
  "context": [
    { "role": "user", "content": "修复登录失败。" },
    { "role": "assistant", "content": "尚未修改代码，准备先分析原因。" }
  ],
  "fields": []
}
```

需要核对的是当前“只分析”的有效请求，而不是继续执行已经撤回的“修复”。当前明确禁止修改时，结果应保留相应约束。具体措辞可以变化，不能只对照某一份固定 JSON。

## 相关历史与来源

```json
{
  "input": "查一下它。",
  "context": [
    { "role": "user", "content": "订单编号是 000123。" }
  ],
  "fields": ["orderId"]
}
```

在已定义 orders Schema 的实例中，模型可以根据明确的上下文确定订单。data 候选引用实际 context 来源；宿主更广的隐藏历史不自动成为模块材料。

对应完整结果可以如下，原始 input 保持原样，归一化表达和对象结合显式 context：

<!-- response: context -->
```json
{
  "input": "查一下它。",
  "normalizedInput": "查询订单 000123。",
  "primaryIntent": "查询订单 000123",
  "requirements": [],
  "intents": [
    { "id": "i1", "action": "query", "target": "订单 000123", "requirements": [], "status": "ready" }
  ],
  "prohibitions": [],
  "data": { "orderId": "000123" }
}
```

本例 data 候选的 sources 使用 `{ "sourceId": "context:0", "quote": "000123" }`；来源记录由模块校验，最终响应只保留公共 data。过程结构见[任务与候选](../api/bridge-mcp.md#任务与候选)。

也可提供文字 context，适合清晰的背景说明。若先后关系重要，使用按时间排列的消息更容易保留顺序。

## 字段范围

假设 Schema 定义 `orderId` 和 `note`：

| fields | 所选扩展 |
| --- | --- |
| 省略 | orderId 与 note |
| `["orderId"]` | orderId |
| `["note"]` | note |
| `[]` | 无 |

字段选择只控制扩展范围。每次都要保留默认意图的全部有效动作、条件、要求和禁止事项；未知字段会被拒绝。

## 多动作与多对象

“查询订单 A，并分析订单 B 的延迟原因”应分别表达对象和动作。不能把所有动作拼成一个模糊 target。扩展 Schema 也应能表示实际数量和对应关系，否则需要调整定义或处理数据问题。

完整多动作输出及局部 requirements 示例见[响应结构](../api/response.md#多动作与局部要求)。

更多检查点见[意图契约](../guide/intent-contract.md)和[语义验证](../testing/validation.md#真实语义与准确率)。

## 部分字段与跨字段约束

这个独立例子定义两个必填时间字段，以及约束两者关系的根 description。将 Schema 配置在 Intent 或 MCP 命名实例中：

<!-- business-schema: partial-fields -->
```json
{
  "type": "object",
  "description": "结束时间不得早于原材料中的开始时间。",
  "properties": {
    "startTime": { "type": "string" },
    "endTime": { "type": "string" }
  },
  "required": ["startTime", "endTime"],
  "additionalProperties": false
}
```

只提取 endTime，startTime 的必填属性不进入所选 data，但原材料中的开始时间仍用于核对根描述：

<!-- parse-request: partial-fields -->
```json
{
  "input": "查询会议时间：开始时间09:00，结束时间10:00。",
  "fields": ["endTime"]
}
```

完整成功 data 候选如下。仅选一个字段，也不能省略适用的根 descriptionChecks：

<!-- model-candidate: partial-fields -->
```json
{
  "data": { "endTime": "10:00" },
  "evidence": [
    { "path": "/data/endTime", "mode": "exact", "sources": [{ "sourceId": "input", "quote": "10:00" }] }
  ],
  "descriptionChecks": [
    { "path": "/data", "verdict": "satisfied", "explanation": "10:00晚于原材料中的09:00。", "sources": [{ "sourceId": "input", "quote": "开始时间09:00，结束时间10:00" }] }
  ],
  "fieldResults": [
    { "path": "/data/endTime", "status": "extracted", "explanation": "结束时间明确，关系材料完整。" }
  ],
  "issues": []
}
```

<!-- response: partial-fields -->
```json
{
  "input": "查询会议时间：开始时间09:00，结束时间10:00。",
  "normalizedInput": "查询会议时间，开始时间09:00，结束时间10:00。",
  "primaryIntent": "查询会议时间",
  "requirements": [],
  "intents": [
    { "id": "i1", "action": "query", "target": "会议时间", "requirements": [], "status": "ready" }
  ],
  "prohibitions": [],
  "data": { "endTime": "10:00" }
}
```

startTime 没有返回；它的材料可以被引用。若完整候选缺少根检查，则属于 MODEL_OUTPUT_INVALID，可进入候选修复，而非自动忽略该描述。

### 缺少关系材料

仍使用上述 Schema 和 fields，只把输入改为：

<!-- parse-request: missing-dependency -->
```json
{
  "input": "查询会议结束时间：结束时间10:00，未提供开始时间。",
  "fields": ["endTime"]
}
```

结束时间虽已给出，但无法判断相对开始时间的关系。候选保留明确值与来源，并报告依赖缺失；根描述检查为 undetermined，另产生 DATA_DESCRIPTION_UNDETERMINED：

<!-- model-candidate: missing-dependency -->
```json
{
  "data": { "endTime": "10:00" },
  "evidence": [
    { "path": "/data/endTime", "mode": "exact", "sources": [{ "sourceId": "input", "quote": "10:00" }] }
  ],
  "descriptionChecks": [
    { "path": "/data", "verdict": "undetermined", "explanation": "缺少开始时间，无法核对结束时间是否更早。", "sources": [{ "sourceId": "input", "quote": "结束时间10:00，未提供开始时间" }] }
  ],
  "fieldResults": [
    { "path": "/data/endTime", "status": "extracted", "explanation": "结束时间明确提供；关系材料缺失由检查和issue报告。" }
  ],
  "issues": [
    { "code": "DATA_DEPENDENCY_MISSING", "category": "business_information", "path": "/data/endTime", "message": "缺少判断关系所需的开始时间。" }
  ]
}
```

API 抛出以下序列化错误；Bridge/MCP 放在 error 分支。模块反馈业务材料问题，不用格式修复补造开始时间，也不返回部分业务 data。默认 query 的 ready 状态保留：

<!-- error-response: dependency -->
```json
{
  "code": "DATA_EXTRACTION_FAILED",
  "stage": "data",
  "message": "Selected extension information cannot satisfy the definition.",
  "issues": [
    { "code": "DATA_DESCRIPTION_UNDETERMINED", "category": "definition", "path": "/data", "message": "缺少开始时间，无法核对结束时间是否更早。" },
    { "code": "DATA_DEPENDENCY_MISSING", "category": "business_information", "path": "/data/endTime", "message": "缺少判断关系所需的开始时间。" }
  ],
  "partialResult": {
    "input": "查询会议结束时间：结束时间10:00，未提供开始时间。",
    "normalizedInput": "查询会议结束时间，已提供10:00，缺少开始时间。",
    "primaryIntent": "查询会议结束时间",
    "requirements": [],
    "intents": [
      { "id": "i1", "action": "query", "target": "会议结束时间", "requirements": [], "status": "ready" }
    ],
    "prohibitions": [],
    "data": {}
  }
}
```

补充相关材料后重新识别；不要将未选字段的必填检查与根关系描述的适用性混为一谈。描述 verdict 是模型给出的检查结论，本地来源校验不替代独立语义复核。
