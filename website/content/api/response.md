---
title: 响应结构
description: IntentResult 的完整类型、字段、四种状态、空值规则，以及成功、澄清、多动作和业务字段的完整响应示例。
---

# 响应结构

`await intent.parse(request)` 成功时直接返回 `IntentResult`。Bridge 成功时返回 `{ kind: "result", result: IntentResult }`；MCP 工具把该回复放在 `structuredContent` 中，最终结果位于 `structuredContent.result`。完整外层结构见 [Bridge 与 MCP](./bridge-mcp.md#回复类型)。

API 失败时抛出 `IntentParseError`；Bridge/MCP 返回 error 分支，见[错误与部分结果](./errors.md)。下面的成功结果均包含七个根字段。说明文字的具体措辞由模型生成，示例用于展示结构，不代表真实模型已通过语义验收。

## 完整公共类型

这些类型可从 `@devcodex/intent-runtime` 导入。`IntentItem` 按 status 区分分支；`reason?: never` 表示该字段应当省略。

```ts
type IntentAction = "query" | "analyze" | "generate" | "modify" | "delete" | "execute" | "other";
type IntentStatus = "ready" | "needs_clarification" | "awaiting_confirmation" | "conditional";
type JsonValue =
  | null
  | string
  | number
  | boolean
  | JsonValue[]
  | { [key: string]: JsonValue };

interface Clarification {
  question: string;
  options: string[];
}

interface ItemBase {
  id: string;
  target: string | null;
  requirements: string[];
}

type IntentItem = ItemBase &
  (
    | {
        action: IntentAction;
        status: "ready";
        reason?: never;
        clarification?: never;
      }
    | {
        action: IntentAction | null;
        status: "needs_clarification";
        reason: string;
        clarification: [Clarification, ...Clarification[]];
      }
    | {
        action: IntentAction;
        status: "awaiting_confirmation" | "conditional";
        reason: string;
        clarification?: never;
      }
  );

interface IntentResult {
  input: string;
  normalizedInput: string;
  primaryIntent: string | null;
  requirements: string[];
  intents: IntentItem[];
  prohibitions: string[];
  data: Record<string, JsonValue>;
}
```

`ItemBase` 用于解释共同字段，不是包的独立公开导出。动作类别的语义见[意图契约](../guide/intent-contract.md#动作分类)。

## 根字段

| 字段 | 类型 | 必填 | 含义与空值规则 |
| --- | --- | --- | --- |
| `input` | string | 是 | 原样保留模块收到的 input，包括空格和换行；输入必须含非空白文字 |
| `normalizedInput` | string | 是 | 当前有效请求的归一化表达，不能为空白文字 |
| `primaryIntent` | string \| null | 是 | 主要目的；没有有效动作、主要目的不明确或多个同等目标时可为 null；有值时不能为空白文字 |
| `requirements` | string[] | 是 | 请求整体适用的要求；没有时为 `[]`，元素不能为空白文字 |
| `intents` | IntentItem[] | 是 | 当前有效动作；没有实际请求时可为 `[]`，多动作时包含多项 |
| `prohibitions` | string[] | 是 | 请求整体适用的禁止事项；没有时为 `[]`，元素不能为空白文字 |
| `data` | Record<string, JsonValue> | 是 | 所选业务字段；没有扩展字段、fields 为 `[]` 或所有所选可选字段均未提供时可为 `{}` |

纯事实或背景不必产生动作。`primaryIntent` 是说明文字，不是业务类型枚举，也不能作为唯一的动作判定依据；需要按 `intents` 逐项读取。

## 动作字段与状态

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `id` | string | 每项必填；当前实现按结果内顺序生成 `i1`、`i2` 等，只在本次结果内标识动作，不是跨请求的业务主键 |
| `action` | IntentAction \| null | 每项必填；只有 needs_clarification 允许 null |
| `target` | string \| null | 每项必填；对象不明确时允许 null，有值时不能为空白文字 |
| `requirements` | string[] | 每项必填；当前动作或阶段的局部要求，无要求时为 `[]` |
| `status` | IntentStatus | 每项必填；按下表读取附加字段 |
| `reason` | string | 除 ready 外必填，不能为空白文字；ready 中省略 |
| `clarification` | 非空 Clarification[] | 仅 needs_clarification 必填；其他状态中省略 |

| status | action | reason | clarification |
| --- | --- | --- | --- |
| `ready` | 七种 action 之一 | 省略 | 省略 |
| `needs_clarification` | 七种 action 之一或 null | 必填 | 至少一条 |
| `awaiting_confirmation` | 七种 action 之一 | 必填 | 省略 |
| `conditional` | 七种 action 之一 | 必填 | 省略 |

每条 clarification 必须同时包含非空白 `question` 和 `options: string[]`。没有明确选项时写 `options: []`；提供的选项不能为空白文字。允许多个问题。

多个阻塞条件可以同时存在。当前状态按 **needs_clarification → awaiting_confirmation → conditional → ready** 的优先级选择；`reason` 按澄清、确认、条件的顺序用换行连接已有原因。即使 status 是 needs_clarification，也可能仍有确认或条件前提，应用应保留完整 reason 和 requirements。

全局 requirements/prohibitions 适用于整个请求；局部和阶段限定的约束放在相应动作的 requirements。用户明确给出先后关系时，intents 按该关系排列，否则按呈现顺序排列。数组顺序不能独立构成执行依赖或授权。

## data 的省略与 null

data 只返回所选的顶层业务字段，字段内部保留 Schema 要求的完整结构。可选字段缺少材料时省略该属性，不能自动补为 false、0、空字符串或 null。null 必须同时得到 Schema 许可和明确空值材料支持。必填字段缺失时按[提取失败](./errors.md#完整失败示例)处理。

叶值可以是 JSON 字符串、数字、布尔值、null、数组或对象；精确编号建议使用 string。模块不自动转换类型或插入 Schema default。最终结果不包含 evidence、descriptionChecks、fieldResults 等过程字段，完整过程结构见[任务与候选](./bridge-mcp.md#任务与候选)。

数字必须能由 JavaScript 有限数值表示，整数必须在安全整数范围内，候选数字文本不能发生十进制往返损失。业务真实值无法按 Schema 表示时，应反馈 DATA_VALUE_UNREPRESENTABLE；需要保存大整数编号时选择 string。

## 默认意图成功

<!-- response: default -->
```json
{
  "input": "分析登录失败原因，先不要修改代码。",
  "normalizedInput": "分析登录失败原因，暂不修改代码。",
  "primaryIntent": "分析登录失败原因",
  "requirements": [],
  "intents": [
    { "id": "i1", "action": "analyze", "target": "登录失败原因", "requirements": [], "status": "ready" }
  ],
  "prohibitions": ["暂不修改代码"],
  "data": {}
}
```

## 需要澄清

<!-- response: clarification -->
```json
{
  "input": "处理一下。",
  "normalizedInput": "请求处理，但操作和对象尚未明确。",
  "primaryIntent": null,
  "requirements": [],
  "intents": [
    {
      "id": "i1",
      "action": null,
      "target": null,
      "requirements": [],
      "status": "needs_clarification",
      "reason": "操作和对象尚未明确。",
      "clarification": [
        { "question": "需要对哪个对象做什么处理？", "options": [] }
      ]
    }
  ],
  "prohibitions": [],
  "data": {}
}
```

## 等待确认

<!-- response: confirmation -->
```json
{
  "input": "删除旧日志，先等我确认。",
  "normalizedInput": "用户确认后删除旧日志。",
  "primaryIntent": "删除旧日志",
  "requirements": [],
  "intents": [
    { "id": "i1", "action": "delete", "target": "旧日志", "requirements": ["先等待用户确认"], "status": "awaiting_confirmation", "reason": "用户要求先确认。" }
  ],
  "prohibitions": [],
  "data": {}
}
```

## 条件尚未满足

<!-- response: conditional -->
```json
{
  "input": "测试全部通过后再发布。",
  "normalizedInput": "测试全部通过后发布。",
  "primaryIntent": "发布",
  "requirements": [],
  "intents": [
    { "id": "i1", "action": "execute", "target": "发布", "requirements": ["测试全部通过后"], "status": "conditional", "reason": "尚未提供测试全部通过的记录。" }
  ],
  "prohibitions": [],
  "data": {}
}
```

## 多动作与局部要求

<!-- response: multiple -->
```json
{
  "input": "先分析登录失败原因，再写分析报告；报告用中文。",
  "normalizedInput": "先分析登录失败原因，再用中文生成分析报告。",
  "primaryIntent": "分析登录失败原因并生成报告",
  "requirements": [],
  "intents": [
    { "id": "i1", "action": "analyze", "target": "登录失败原因", "requirements": [], "status": "ready" },
    { "id": "i2", "action": "generate", "target": "分析报告", "requirements": ["分析完成后", "报告用中文"], "status": "conditional", "reason": "分析尚未完成。" }
  ],
  "prohibitions": [],
  "data": {}
}
```

## 没有有效动作

<!-- response: no-intent -->
```json
{
  "input": "订单编号是 000123。",
  "normalizedInput": "提供订单编号 000123，未提出操作请求。",
  "primaryIntent": null,
  "requirements": [],
  "intents": [],
  "prohibitions": [],
  "data": {}
}
```

## 业务字段提取成功

本例需要已定义并选择 orderId 字段，配置与调用见[订单字段提取](../examples/orders.md)。

<!-- response: data -->
```json
{
  "input": "查询订单 000123",
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

需要业务字段却提取失败时，读取[完整错误和 partialResult](./errors.md#完整失败示例)。`ready` 仅表示请求能够表达，实际业务执行、授权和完成记录由应用管理。
