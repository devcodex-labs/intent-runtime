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

总预算、总期限保留为一次全局要求，不拆成每个动作分别享有同样预算。阶段限制保留在相应动作中，例如“分析阶段不修改”不会取消用户明确请求的后续修改。复合前提和可选措辞完整保存在 requirements 中，不新增依赖或决定用户未作出的选择。

## data 的省略与 null

data 只返回所选的顶层业务字段，字段内部保留 Schema 要求的完整结构。可选字段缺少材料时省略该属性，不能自动补为 false、0、空字符串或 null。null 必须同时得到 Schema 许可和明确空值材料支持。必填字段缺失时按[提取失败](./errors.md#完整失败示例)处理。

叶值可以是 JSON 字符串、数字、布尔值、null、数组或对象；精确编号建议使用 string。模块不自动转换类型或插入 Schema default。最终结果不包含 evidence、descriptionChecks、fieldResults 等过程字段，完整过程结构见[任务与候选](./bridge-mcp.md#任务与候选)。

数字必须能由 JavaScript 有限数值表示，整数必须在安全整数范围内，候选数字文本不能发生十进制往返损失。业务真实值无法按 Schema 表示时，应反馈 DATA_VALUE_UNREPRESENTABLE；需要保存大整数编号时选择 string。

部分选择字段时，适用的根 description 仍需核对；未选事实可作为关系检查的材料，但不出现在 data 中。见[部分字段与跨字段约束](../examples/context-fields.md#部分字段与跨字段约束)。

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
    { "id": "i2", "action": "generate", "target": "分析报告", "requirements": ["分析完成后", "报告用中文"], "status": "conditional", "reason": "尚未提供分析完成的材料。" }
  ],
  "prohibitions": [],
  "data": {}
}
```

## 全局要求与局部要求

根 requirements 约束整个请求；“分析结论用中文”只针对当前动作。prohibitions 独立保留明确禁止事项。

<!-- response: global-requirements -->
```json
{
  "input": "分析项目，分析结论用中文。全过程只使用已提供材料，总预算不超过100元，不要联网。",
  "normalizedInput": "仅依据已提供材料分析项目，用中文给出分析结论；总预算不超过100元，不联网。",
  "primaryIntent": "分析项目",
  "requirements": ["全过程只使用已提供材料", "总预算不超过100元"],
  "intents": [
    { "id": "i1", "action": "analyze", "target": "项目", "requirements": ["分析结论用中文"], "status": "ready" }
  ],
  "prohibitions": ["不要联网"],
  "data": {}
}
```

## 阶段限制与总预算

这里明确请求了分析和修改两个阶段。“分析阶段不修改代码”属于分析动作的局部要求；总预算和期限仍各保留一次。缺少条件成立的记录时保留条件，不据此宣称前序工作一定没有完成。

<!-- response: phases -->
```json
{
  "input": "先分析登录失败原因，分析阶段不修改代码；分析完成且测试环境就绪后，再修改登录模块。总预算不超过100元，今天18:00前完成；不要删除文件。",
  "normalizedInput": "先分析登录失败原因且该阶段不修改代码；分析完成且测试环境就绪后修改登录模块。总预算不超过100元，今天18:00前完成，不删除文件。",
  "primaryIntent": "分析登录失败原因并修改登录模块",
  "requirements": ["总预算不超过100元", "今天18:00前完成"],
  "intents": [
    { "id": "i1", "action": "analyze", "target": "登录失败原因", "requirements": ["分析阶段不修改代码"], "status": "ready" },
    { "id": "i2", "action": "modify", "target": "登录模块", "requirements": ["分析完成且测试环境就绪后"], "status": "conditional", "reason": "尚未提供分析完成和测试环境就绪的材料。" }
  ],
  "prohibitions": ["不要删除文件"],
  "data": {}
}
```

## 复合条件与可选动作

AND/OR 分组保留在动作 requirements 中，不拆成丢失逻辑关系的独立短句。可选的生成动作仍保留可选措辞；ready 不将它变成必做项。

<!-- response: compound-conditions -->
```json
{
  "input": "仅在（测试通过且负责人确认）或预发布验证通过后发布；发布说明可以选择生成，不是必做项。",
  "normalizedInput": "仅在（测试通过且负责人确认）或预发布验证通过后发布；生成发布说明为可选项。",
  "primaryIntent": "满足条件后发布",
  "requirements": [],
  "intents": [
    { "id": "i1", "action": "execute", "target": "发布", "requirements": ["仅在（测试通过且负责人确认）或预发布验证通过后"], "status": "conditional", "reason": "尚未提供满足任一发布路径的材料。" },
    { "id": "i2", "action": "generate", "target": "发布说明", "requirements": ["可选，不是必做项"], "status": "ready" }
  ],
  "prohibitions": [],
  "data": {}
}
```

## 多个阻塞同时存在

status 采用最高优先级的澄清状态，reason 仍按顺序保留澄清、确认与条件原因。澄清后的确认和备份前提不能被丢弃。

<!-- response: combined-blockers -->
```json
{
  "input": "删除旧日志；先明确是应用日志还是审计日志，等我确认并通过备份检查后再删除。",
  "normalizedInput": "先明确旧日志类型，用户确认且备份检查通过后删除。",
  "primaryIntent": "删除旧日志",
  "requirements": [],
  "intents": [
    {
      "id": "i1",
      "action": "delete",
      "target": "旧日志",
      "requirements": ["先明确日志类型", "等待用户确认", "备份检查通过后"],
      "status": "needs_clarification",
      "reason": "尚未明确应用日志还是审计日志。\n等待用户确认。\n尚未提供备份检查通过的材料。",
      "clarification": [
        { "question": "需要删除哪类旧日志？", "options": ["应用日志", "审计日志"] }
      ]
    }
  ],
  "prohibitions": [],
  "data": {}
}
```

## 取消已有请求

取消已有发货申请改变该申请的状态，分类为 modify；不添加删除订单或回滚已完成工作的动作。

<!-- response: modify -->
```json
{
  "input": "取消订单000123的发货申请，订单本身保留。",
  "normalizedInput": "取消订单000123的发货申请，保留订单本身。",
  "primaryIntent": "取消发货申请",
  "requirements": [],
  "intents": [
    { "id": "i1", "action": "modify", "target": "订单000123的发货申请", "requirements": ["保留订单本身"], "status": "ready" }
  ],
  "prohibitions": [],
  "data": {}
}
```

## 创建业务对象

这里的订单是业务对象，使用 other；生成订单示例文本属于 generate，是不同请求。ready 仍只表示意图能够表达。

<!-- response: other -->
```json
{
  "input": "创建一笔业务订单，不要生成示例订单文本。",
  "normalizedInput": "创建一笔业务订单，不生成示例订单文本。",
  "primaryIntent": "创建业务订单",
  "requirements": [],
  "intents": [
    { "id": "i1", "action": "other", "target": "业务订单", "requirements": [], "status": "ready" }
  ],
  "prohibitions": ["不要生成示例订单文本"],
  "data": {}
}
```

## 只有约束而没有动作

只有预算和禁止事项时保留它们，intents 可以为空；不为要求虚构一个执行动作。

<!-- response: constraints-only -->
```json
{
  "input": "总预算不得超过100元，不要删除文件。",
  "normalizedInput": "总预算不得超过100元，不删除文件；未提出具体操作请求。",
  "primaryIntent": null,
  "requirements": ["总预算不得超过100元"],
  "intents": [],
  "prohibitions": ["不要删除文件"],
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

## 可选字段、空值与嵌套业务数据

本例的完整 Schema、请求和 data 候选见[多订单与不同值类型](../examples/orders.md#多订单与不同值类型)。urgent、budget、note、tags、metadata 都有明确材料支持；配送说明没有提供，deliveryNote 被省略。orders 保留编号与数量的对应关系。

<!-- response: data-values -->
```json
{
  "input": "查询订单000123数量2、000124数量1。加急标志为false，预算为0，备注值为null，标签为空数组，附加信息为空对象；未提供配送说明。",
  "normalizedInput": "查询订单000123（数量2）和000124（数量1）；加急为false，预算为0，备注为null，标签与附加信息分别为空数组和空对象，未提供配送说明。",
  "primaryIntent": "查询两个订单",
  "requirements": [],
  "intents": [
    { "id": "i1", "action": "query", "target": "订单000123（数量2）和000124（数量1）", "requirements": [], "status": "ready" }
  ],
  "prohibitions": [],
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
  }
}
```

空值来自明确材料，不用来代替未知。过程中的 evidence、descriptionChecks 和 fieldResults 不出现在最终 IntentResult 中。
