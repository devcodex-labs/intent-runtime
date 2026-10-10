---
title: 意图契约
description: 理解 IntentResult 的默认字段、动作分类、状态、要求与禁止事项。
---

# 意图契约

`IntentResult` 包含固定的默认字段和扩展 `data`。下面是便于理解的示例，措辞和 id 不作为逐字验收标准：

```json
{
  "input": "分析登录失败原因，先不要修改代码。",
  "normalizedInput": "分析登录失败原因，暂不修改代码。",
  "primaryIntent": "分析登录失败原因",
  "requirements": [],
  "intents": [
    { "id": "intent-1", "action": "analyze", "target": "登录失败原因", "status": "ready", "requirements": [] }
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

## 理解状态

| status | 附加字段 | 含义 |
| --- | --- | --- |
| `ready` | 无 reason/clarification | 请求在已提供材料下能够表达 |
| `needs_clarification` | `reason` 和非空 `clarification` | 缺少需要用户澄清的信息 |
| `awaiting_confirmation` | `reason` | 请求明确要求先确认 |
| `conditional` | `reason` | 动作依赖明确的条件或前提 |

`clarification` 中的元素为 `{ "question": "…", "options": [] }`，可提供选项。应用可以据此向用户提问。

`ready` 不能替代业务授权；`awaiting_confirmation` 也不自动批准后续动作。状态是对材料的理解，应用决定如何推进。

## 语义边界

识别应保留明确的否定、例外、先后条件、数值单位和多对象关系。只提供“分析原因”时，不应添加“实施修复”；明确“暂不修改”时，应保留禁止事项。

这些规则通过提示、结构校验、来源检查和测试共同约束，不能从 JSON 合法直接推出语义正确。实际结果的动作与含义应按[评测方法](../testing/validation.md)核对。
