---
title: 意图契约
description: 理解 IntentResult 的默认字段、动作分类、状态、要求与禁止事项。
---

# 意图契约

`IntentResult` 包含固定的默认字段和扩展 `data`。完整类型、必填与空值规则、全部状态和 JSON 示例见[响应结构](../api/response.md)。下面是便于理解的示例，说明措辞不作为逐字验收标准：

<!-- response: intent-contract -->
```json
{
  "input": "分析登录失败原因，先不要修改代码。",
  "normalizedInput": "分析登录失败原因，暂不修改代码。",
  "primaryIntent": "分析登录失败原因",
  "requirements": [],
  "intents": [
    { "id": "i1", "action": "analyze", "target": "登录失败原因", "status": "ready", "requirements": [] }
  ],
  "prohibitions": ["暂不修改代码"],
  "data": {}
}
```

## 默认字段

| 字段 | 含义 |
| --- | --- |
| `input` | 模块收到的原始请求，原样保留 |
| `normalizedInput` | 当前有效请求的归一化表达 |
| `primaryIntent` | 主要意图的说明；没有有效动作时可为 null |
| `requirements` | 对当前请求整体有效的要求 |
| `intents` | 当前有效动作列表，可为空或包含多个动作 |
| `prohibitions` | 明确禁止事项 |
| `data` | 已成功提取的所选业务字段；未选择扩展时为 `{}` |

每个动作有 `id`、`action`、`target`、`status` 和局部 `requirements`。`target` 无法确定时可为 null。

## 动作分类

| action | 含义 |
| --- | --- |
| `query` | 查询、获取信息 |
| `analyze` | 分析、判断或解释 |
| `generate` | 生成内容 |
| `modify` | 修改已有对象 |
| `delete` | 删除对象 |
| `execute` | 执行操作 |
| `other` | 无法归入上述类别的有效动作 |

这套分类表达用户请求，不选工具、不执行动作。`needs_clarification` 状态下尚不能确定动作类别时，`action` 允许为 null。

### 易混淆的分类边界

| 当前请求 | 分类及原因 |
| --- | --- |
| 取消已有申请、重命名或移动已有对象 | modify：改变已有对象或请求的状态，不自动删除对象、回滚已完成工作 |
| 发送已有报告 | execute：明确交付已有内容，不新增生成报告动作 |
| 创建一笔业务订单 | other：创建非内容业务对象；生成订单示例文本才是 generate |
| 生成脚本并运行 | generate 与 execute：两个动作均由用户明确提出 |
| 比较项目 A 与 B | analyze：保留比较关系，两个对象不必拆成两个动作 |

完整响应见[取消已有请求](../api/response.md#取消已有请求)、[创建业务对象](../api/response.md#创建业务对象)及[多动作](../api/response.md#多动作与局部要求)。

## 理解状态

| status | 附加字段 | 含义 |
| --- | --- | --- |
| `ready` | 无 reason/clarification | 请求在已提供材料下能够表达 |
| `needs_clarification` | `reason` 和非空 `clarification` | 缺少需要用户澄清的信息 |
| `awaiting_confirmation` | `reason` | 请求明确要求先确认 |
| `conditional` | `reason` | 动作依赖明确的条件或前提 |

`clarification` 中的元素为 `{ "question": "…", "options": [] }`，question 和 options 都是必填字段；没有明确选项时 options 为空数组。应用可以据此向用户提问。多个阻塞同时存在时的状态优先级与 reason 规则见[动作字段与状态](../api/response.md#动作字段与状态)。

`ready` 不能替代业务授权；`awaiting_confirmation` 也不自动批准后续动作。状态是对材料的理解，应用决定如何推进。

## 语义边界

识别应保留明确的否定、例外、先后条件、数值单位和多对象关系。只提供“分析原因”时，不应添加“实施修复”；明确“暂不修改”时，应保留禁止事项。

整体预算与期限只保留一次，局部/阶段限制放在相应动作 requirements；只有约束时 intents 可以为空。复合条件保留分组，可选项保留可选含义。完整例子见[全局与局部要求](../api/response.md#全局要求与局部要求)、[阶段限制](../api/response.md#阶段限制与总预算)和[只有约束](../api/response.md#只有约束而没有动作)。

这些规则通过提示、结构校验、来源检查和测试共同约束，不能从 JSON 合法直接推出语义正确。实际结果的动作与含义应按[评测方法](../testing/validation.md)核对。
