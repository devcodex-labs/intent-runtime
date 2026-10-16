# 完整响应结构

本页回答“返回了什么、什么时候出现、应该怎样消费”。首次接入可先运行[快速开始](/guide/quick-start)，处理顺序见[如何读取结果](/guide/results)，所有公开定义见[TypeScript 类型](/api/types)。

| 你要核对什么 | 直接查看 |
|---|---|
| 用户目标、禁止事项和本轮变化 | [turn](#本轮-turn-与变更)、[effective](#有效理解-effective) |
| 参数属于哪个意图，false/null是否能用 | [字段状态](#状态与消费规则) |
| 歧义、候选和未确认推断 | [问题与推断](#问题候选与推断) |
| 完整配置、请求和结果 | [场景下载](#完整场景与多轮材料) |
| MCP外层工具回复 | [工具与协议参考](/api/mcp#成功与错误信封) |

TypeScript 消费方直接引用公开类型，字段类型可通过索引访问取得：

<!-- typecheck -->
```ts
import type {IntentResult, TurnUnderstanding} from '@devcodex/intent-runtime';
type Response = IntentResult;
type TurnKind = TurnUnderstanding['kind'];
```

## 默认 Native 调用与结果

按[快速开始的模型配置](/guide/quick-start#2-配置模型)设置环境变量，在已安装匹配版本的项目保存以下完整文件并运行 `node native-response.mjs`。这里选择了 orderId；默认输出不开启建议、详细证据、诊断和扩展提取。

<!-- example: examples/api/native-response.mjs -->
```js
import {Intent, IntentError} from '@devcodex/intent-runtime';
import {createApiExecutor} from '@devcodex/intent-runtime/adapters/api';

const apiKey = process.env.INTENT_API_KEY, model = process.env.INTENT_MODEL;
if (!apiKey || !model) throw new Error('Set INTENT_API_KEY and INTENT_MODEL in your environment.');
const intent = new Intent({
  language: 'zh-CN',
  executor: createApiExecutor({provider: 'openai', apiKey, model}),
  schema: {type: 'object', properties: {orderId: {type: 'string', pattern: '^[0-9]+$'}}},
});
try {
  const result = await intent.parse({input: '查询订单000123，不要取消订单', fields: ['orderId']});
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  if (!(error instanceof IntentError)) throw error;
  console.error(JSON.stringify(error.toJSON()));
  process.exitCode = 1;
} finally {await intent.dispose();}
```

下面是**阅读摘要，仅展示相关字段**。完整返回不会省略必有数组或对象。

| 含义 | 结果位置 | 本例 |
|---|---|---|
| 本轮请求 | turn.kind | request |
| 用户目标 | effective.intents[0].goal | 查询订单000123 |
| 禁止事项 | effective.intents[0].constraints | prohibition：不要取消订单 |
| 参数与归属 | effective.intents[0].inputs.orderId | 字符串 "000123" |
| 本轮参数检查 | fieldResults[] | present，关联上述意图 ID |
| 需要澄清的问题 | issues | [] |

这是固定语言候选经过正式核心及真实 schema-dsl Validator 得到的结构示例；ID统一改为可读名称，真实模型的表述与ID可以变化。它不表示业务已经查询或取消订单。

<a href="/intent-runtime/examples/native-request.json" download target="_blank" rel="noopener noreferrer">下载 Native 配置与请求</a> · <a href="/intent-runtime/examples/native-result.json" download target="_blank" rel="noopener noreferrer">下载完整 Native 结果</a>

<details>
<summary>展开默认完整 Native JSON</summary>

<!-- result: native -->
```json
{
  "schemaVersion": "2.0-draft.6",
  "input": "查询订单000123，不要取消订单",
  "status": "complete",
  "turn": {
    "kind": "request",
    "normalizedInput": "查询订单000123，不要取消订单",
    "intentIds": [
      "intent-2"
    ],
    "changes": [
      {
        "operation": "add",
        "target": {
          "kind": "intent",
          "id": "intent-2"
        },
        "description": "新增本轮明确请求",
        "sourceRefs": [
          {
            "root": "input",
            "pointer": ""
          }
        ],
        "effect": "applied"
      },
      {
        "operation": "add",
        "target": {
          "kind": "constraint",
          "id": "constraint-2"
        },
        "description": "新增本轮明确请求",
        "sourceRefs": [
          {
            "root": "input",
            "pointer": ""
          }
        ],
        "effect": "applied"
      }
    ],
    "facts": {}
  },
  "effective": {
    "schemaVersion": "2.0-draft.6",
    "coverage": "complete",
    "scope": "current_request",
    "intents": [
      {
        "id": "intent-2",
        "domain": null,
        "action": "查询",
        "target": "订单000123",
        "goal": "查询订单000123",
        "understanding": "clear",
        "constraints": [
          {
            "id": "constraint-2",
            "kind": "prohibition",
            "text": "不要取消订单",
            "scope": {
              "type": "intent",
              "intentId": "intent-2"
            }
          }
        ],
        "inputs": {
          "orderId": "000123"
        },
        "references": [],
        "children": [],
        "extensions": {}
      }
    ],
    "constraints": [],
    "relations": [],
    "unresolved": []
  },
  "fieldResults": [
    {
      "container": "inputs",
      "intentId": "intent-2",
      "field": "orderId",
      "path": "/orderId",
      "status": "present",
      "trigger": "selection",
      "sourceRefs": [
        {
          "root": "input",
          "pointer": ""
        }
      ]
    }
  ],
  "issues": [],
  "inferences": []
}
```

</details>

## 根级字段

“必有”表示正常返回的 IntentResult 中一定出现，没有内容时通常为 [] 或 {}；“可选”表示可以省略，不等于返回 null。对象中的 domain/action/target、字段归属 intentId 等允许 null 的位置单独列明。技术失败走异常或错误信封，不返回一份字段残缺的成功结果。

| 路径 | 类型 | 出现条件 | 含义与示例 |
|---|---|---|---|
| schemaVersion | '2.0-draft.6' | 必有 | 结果格式版本，不是 npm 版本或请求序号 |
| input | string | 必有 | 本次原始 input，不用 normalizedInput 替换原文 |
| status | 'complete' 或 'partial' | 必有 | 当前理解完整度，不保证字段齐全、业务授权或业务已执行 |
| turn | TurnUnderstanding | 必有 | 本轮语义、关联、变化和事实 |
| effective | EffectiveIntentSnapshot | 必有 | 基于相关材料理解的唯一有效意图树及约束 |
| fieldResults | FieldResult[] | 必有 | 本轮所选字段及旧值失效报告；默认 fields=[] 时可为空 |
| issues | IntentIssue[] | 必有 | 语义、字段、上下文问题；没有问题为 [] |
| inferences | IntentInference[] | 必有 | 未确认推断，不当作用户事实；无推断为 [] |
| suggestions | IntentSuggestion[] | suggestions 开启时 | 无建议为 []；关闭时省略 |
| evidence | SourceEvidence[] | evidence 开启时 | 详细证据，无证据为 []；关闭不移除必要来源 |
| diagnostics | IntentDiagnostics | diagnostics 开启时 | 诊断对象；关闭时省略 |

## 本轮 turn 与变更

| 路径 | 类型 | 出现条件 | 含义与示例 |
|---|---|---|---|
| turn.kind | TurnUnderstanding['kind'] | 必有 | request/amendment/confirmation/rejection/withdrawal/answer/statement/mixed/unclear |
| turn.normalizedInput | string | 必有 | 忠实整理本轮表达，不补业务步骤或未提供事实 |
| turn.intentIds | string[] | 必有 | 关联当前有效意图；已撤回目标不留在此数组 |
| turn.changes | IntentChange[] | 必有 | 仅表达本轮引起的关联和变化，不是业务执行指令 |
| turn.facts | JsonObject | 必有 | 没有操作意图的所选事实；未选择字段时不自动提取 |
| turn.changes[].operation | add/modify/withdraw/confirm/reject | 必有 | 变化动作，需结合 effect 读取 |
| turn.changes[].effect | applied/conditional/unresolved | 必有 | 已反映到识别结果、条件变化或尚未定位 |
| turn.changes[].target | ChangeTarget | 必有 | 变化对象，详见下方联合结构 |
| turn.changes[].target.kind | intent/constraint/relation/unresolved | 必有 | ID的对象类别，不可混用 |
| turn.changes[].target.id | string | kind 非 unresolved 时必有 | 当前对象，或已明确撤回且只存在于前轮材料中的旧对象 ID |
| turn.changes[].target.description | string | kind=unresolved 时必有 | 尚未定位的对象说明，不附伪造 ID |
| turn.changes[].description | string | 必有 | 本轮变化的解释 |
| turn.changes[].sourceRefs | SourceRef[] | 必有 | 本轮输入依据；来源结构见后文 |
| turn.changes[].conditionId | string | conditional 必有；unresolved 可有 | 指向当前约束；applied 禁止携带 |
| turn.changes[].deltas | IntentDelta[] | 仅 applied 可有 | 对已知对象的实际局部差异；其他 effect 禁止携带 |
| turn.changes[].deltas[].path | string | delta 必有 | 相对变化对象的 JSON Pointer，不相对整个 Result |
| turn.changes[].deltas[].operation | set/remove | delta 必有 | 设置或移除，不是业务数据库操作 |
| turn.changes[].deltas[].before | JsonValue | 可选 | 有可靠旧值时返回；省略不表示旧值为 null |
| turn.changes[].deltas[].after | JsonValue | set 必有；remove 禁止 | null 是合法 set 值，与 remove 不同 |

applied 表示识别结果已更新；conditional 保留条件和目标，不提前撤回。撤回目标可能不在新 effective 中，不能因此丢弃合法 withdraw。changes 也不承诺覆盖 Context 重定位等所有内部差异，不作为任意业务状态的通用 patch。

## 有效理解 effective

| 路径 | 类型 | 出现条件 | 含义与示例 |
|---|---|---|---|
| effective.schemaVersion | '2.0-draft.6' | 必有 | 作为下一轮 baseline 的格式版本 |
| effective.coverage | complete/partial/unavailable | 必有 | 相关历史和材料覆盖程度，不等同根级 status |
| effective.scope | current_request/provided_materials | 必有 | 只用了本轮请求，或使用了已提供的相关历史材料 |
| effective.intents | StructuredIntent[] | 必有 | 顶层意图；完整意图仅在此树中保存 |
| effective.constraints | IntentConstraint[] | 必有 | 全局约束，不能只读取每个节点的约束 |
| effective.relations | IntentRelation[] | 必有 | 明确先后、依赖等关系；父子关系只使用 children |
| effective.unresolved | string[] | 必有 | 当前未解决问题的文字摘要，不是 issue ID 列表 |

下面用 **I** 表示 `effective.intents[]` 或递归的 `I.children[]`，用 **C** 表示 `effective.constraints[]` 或 `I.constraints[]`。它们是文档路径模板，不是新增响应字段。

| 路径 | 类型 | 出现条件 | 含义与示例 |
|---|---|---|---|
| I.id | string | 必有 | 意图身份；在有明确前轮材料且目标延续时可保持，不是跨系统永久业务 ID |
| I.domain | string 或 null | 必有 | 领域；无法确定时 null，不编造领域 |
| I.action | string 或 null | 必有 | 请求动作；业务动作标识不随解释语言翻译 |
| I.target | string 或 null | 必有 | 动作对象，未确定时可为 null |
| I.goal | string | 必有 | 用户目标的自然语言表达，不是实施计划 |
| I.understanding | clear/ambiguous/incomplete/conflicted | 必有 | 此节点的理解状态；不等同字段有效性 |
| I.constraints | IntentConstraint[] | 必有 | 该目标及明确作用范围中的约束；同时考虑全局与父级 |
| I.inputs | JsonObject | 必有 | 本意图已选取的业务参数，无新参数时 {}；按 fieldResults 判断可用性 |
| I.optional | boolean | 可选 | 用户明确的可选目标，不代表运行时可随意省略 |
| I.expectedOutput | string[] | 可选 | 明确交付物或成功标准，例如中文使用说明；不是 requirements 副本 |
| I.references | IntentReference[] | 必有 | 该意图使用的对象或材料引用，见后文 |
| I.children | StructuredIntent[] | 必有 | 唯一父子包含关系；无子项为 [] |
| I.extensions | JsonObject | 必有 | 扩展语义标签，默认不新提取时为 {}；不能绕过 fields 提取参数 |
| C.id | string | 必有 | 约束身份，供变化及条件引用 |
| C.kind | requirement/prohibition/precondition/preference | 必有 | 正向要求、禁止、前置条件、偏好 |
| C.text | string | 必有 | 约束原意；例如登录需要邮箱验证码 |
| C.scope | ConstraintScope | 必有 | 约束适用范围，不复制多份权威限制 |
| C.scope.type | global/intent/phase/target | 必有 | 全局、目标、明确阶段或特定引用对象 |
| C.scope.intentId | string | intent/phase/target 必有 | 所属有效意图 ID；global 不携带 |
| C.scope.referenceId | string | target 必有 | 所属意图 references 中的引用 ID |
| C.expression | StructuredExpression | 可选 | 有材料依据时的结构化逻辑；缺省不表示条件为真 |

### 要求、限制与交付物

“登录需要邮箱验证码”是 `kind=requirement`；“不要修改数据库”是 prohibition；“审核通过后才启用”是 precondition；“优先沿用现有样式”是 preference；“交付中文说明”在所属意图 expectedOutput。没有独立 requirements 数组。

完整输入、配置与结果见<a href="/intent-runtime/examples/requirements-example.json" download target="_blank" rel="noopener noreferrer">父子需求示例</a>。以下结果包含四类约束、父子树、并行关系和交付物：

<details>
<summary>展开父子需求完整结果</summary>

<!-- result: requirements -->
```json
{
  "schemaVersion": "2.0-draft.6",
  "input": "请实现用户模块，包含可并行开发的登录和注册。登录需要邮箱验证码，审核通过后才启用；优先沿用现有样式。整个模块不要修改数据库，交付中文使用说明。",
  "status": "complete",
  "turn": {
    "kind": "request",
    "normalizedInput": "请实现用户模块，包含可并行开发的登录和注册。登录需要邮箱验证码，审核通过后才启用；优先沿用现有样式。整个模块不要修改数据库，交付中文使用说明。",
    "intentIds": [
      "intent-5",
      "intent-6",
      "intent-7"
    ],
    "changes": [
      {
        "operation": "add",
        "target": {
          "kind": "intent",
          "id": "intent-5"
        },
        "description": "新增本轮明确请求",
        "sourceRefs": [
          {
            "root": "input",
            "pointer": ""
          }
        ],
        "effect": "applied"
      },
      {
        "operation": "add",
        "target": {
          "kind": "intent",
          "id": "intent-6"
        },
        "description": "新增本轮明确请求",
        "sourceRefs": [
          {
            "root": "input",
            "pointer": ""
          }
        ],
        "effect": "applied"
      },
      {
        "operation": "add",
        "target": {
          "kind": "intent",
          "id": "intent-7"
        },
        "description": "新增本轮明确请求",
        "sourceRefs": [
          {
            "root": "input",
            "pointer": ""
          }
        ],
        "effect": "applied"
      },
      {
        "operation": "add",
        "target": {
          "kind": "constraint",
          "id": "constraint-4"
        },
        "description": "新增本轮明确请求",
        "sourceRefs": [
          {
            "root": "input",
            "pointer": ""
          }
        ],
        "effect": "applied"
      },
      {
        "operation": "add",
        "target": {
          "kind": "constraint",
          "id": "constraint-5"
        },
        "description": "新增本轮明确请求",
        "sourceRefs": [
          {
            "root": "input",
            "pointer": ""
          }
        ],
        "effect": "applied"
      },
      {
        "operation": "add",
        "target": {
          "kind": "constraint",
          "id": "constraint-6"
        },
        "description": "新增本轮明确请求",
        "sourceRefs": [
          {
            "root": "input",
            "pointer": ""
          }
        ],
        "effect": "applied"
      },
      {
        "operation": "add",
        "target": {
          "kind": "constraint",
          "id": "constraint-7"
        },
        "description": "新增本轮明确请求",
        "sourceRefs": [
          {
            "root": "input",
            "pointer": ""
          }
        ],
        "effect": "applied"
      },
      {
        "operation": "add",
        "target": {
          "kind": "relation",
          "id": "relation-1"
        },
        "description": "新增本轮明确请求",
        "sourceRefs": [
          {
            "root": "input",
            "pointer": ""
          }
        ],
        "effect": "applied"
      }
    ],
    "facts": {}
  },
  "effective": {
    "schemaVersion": "2.0-draft.6",
    "coverage": "complete",
    "scope": "current_request",
    "intents": [
      {
        "id": "intent-5",
        "domain": null,
        "action": "实现",
        "target": "用户模块",
        "goal": "实现用户模块",
        "understanding": "clear",
        "constraints": [
          {
            "id": "constraint-4",
            "kind": "prohibition",
            "text": "不要修改数据库",
            "scope": {
              "type": "intent",
              "intentId": "intent-5"
            }
          }
        ],
        "inputs": {},
        "references": [],
        "children": [
          {
            "id": "intent-6",
            "domain": null,
            "action": "实现",
            "target": "登录",
            "goal": "实现登录",
            "understanding": "clear",
            "constraints": [
              {
                "id": "constraint-5",
                "kind": "requirement",
                "text": "登录需要邮箱验证码",
                "scope": {
                  "type": "intent",
                  "intentId": "intent-6"
                }
              },
              {
                "id": "constraint-6",
                "kind": "precondition",
                "text": "审核通过后才启用登录",
                "scope": {
                  "type": "intent",
                  "intentId": "intent-6"
                }
              },
              {
                "id": "constraint-7",
                "kind": "preference",
                "text": "优先沿用现有样式",
                "scope": {
                  "type": "intent",
                  "intentId": "intent-6"
                }
              }
            ],
            "inputs": {},
            "references": [],
            "children": [],
            "extensions": {}
          },
          {
            "id": "intent-7",
            "domain": null,
            "action": "实现",
            "target": "注册",
            "goal": "实现注册",
            "understanding": "clear",
            "constraints": [],
            "inputs": {},
            "references": [],
            "children": [],
            "extensions": {}
          }
        ],
        "extensions": {},
        "expectedOutput": [
          "中文使用说明"
        ]
      }
    ],
    "constraints": [],
    "relations": [
      {
        "id": "relation-1",
        "fromId": "intent-6",
        "toId": "intent-7",
        "kind": "parallel"
      }
    ],
    "unresolved": []
  },
  "fieldResults": [],
  "issues": [],
  "inferences": []
}
```

</details>

### 表达式

用 **E** 表示 `C.expression` 或其递归子表达式，**O** 表示 comparison 的 left/right 操作数。

| 路径 | 类型 | 出现条件 | 含义与示例 |
|---|---|---|---|
| E.type | comparison/all/any/not | 表达式必有 | 比较、全部、任一、逻辑否定 |
| E.left | ExpressionOperand | comparison 必有 | 左操作数，不隐式查询业务值 |
| E.operator | eq/neq/gt/gte/lt/lte | comparison 必有 | 明确比较关系 |
| E.right | ExpressionOperand | comparison 必有 | 右操作数 |
| E.items | StructuredExpression[] | all/any 必有 | 非空子表达式，保留 AND/OR 组合 |
| E.item | StructuredExpression | not 必有 | 被否定的一个子表达式 |
| O.type | literal/input/source | 操作数必有 | 常量、意图参数、已提供材料 |
| O.value | JsonValue | literal 必有 | 可包含 null 的 JSON 字面量 |
| O.intentId | string | input 必有 | 参数所属有效意图 |
| O.path | string | input 必有 | 相对该意图 inputs 的 JSON Pointer |
| O.ref | SourceRef | source 必有 | 明确的已提供材料位置 |

### 引用与关系

用 **R** 表示 `I.references[]`。

| 路径 | 类型 | 出现条件 | 含义与示例 |
|---|---|---|---|
| R.id | string | 必有 | 所属意图内的引用身份，供 target scope 使用 |
| R.kind | intent/entity/source | 必有 | 意图、业务对象或来源引用 |
| R.ref | string 或 null | 必有 | 已知引用对象；未解析可为 null，不编造实体 ID |
| R.resolved | boolean | 必有 | 引用是否已解析，不表示对象获授权或可执行 |
| R.description | string | 可选 | 引用的可读说明 |
| R.sourceRefs | SourceRef[] | 可选 | 对象位置及引用的来源 |
| effective.relations[].id | string | 必有 | 关系身份，可被 changes 引用 |
| effective.relations[].fromId | string | 必有 | 来源有效意图 ID |
| effective.relations[].toId | string | 必有 | 目标有效意图 ID |
| effective.relations[].kind | before/depends_on/parallel/exclusive/conditional | 必有 | before：from先于to；depends_on：from依赖to；不自动从独立推断并行 |
| effective.relations[].condition | string | conditional 必有 | 明确条件的文字；其他关系不携带 |

## 字段与状态

| 路径 | 类型 | 出现条件 | 含义与示例 |
|---|---|---|---|
| fieldResults[].container | inputs/facts/extensions | 必有 | 权威值所在容器 |
| fieldResults[].intentId | string 或 null | 必有 | inputs/extensions 对应目标；facts 为 null |
| fieldResults[].field | string | 必有 | 被选择或失效的顶层字段名 |
| fieldResults[].path | string | 必有 | 相对所属容器的 JSON Pointer，可定位完整嵌套或原数组索引 |
| fieldResults[].trigger | selection/invalidation | 必有 | 本轮选择，或旧值失效检查 |
| fieldResults[].status | 见下表 | 必有 | 本轮对该绑定的检查结果 |
| fieldResults[].explanation | string | 非 present 时提供 | 解释缺失、无效、不适用等原因 |
| fieldResults[].rawText | string | 可选 | 可保留的原始字段文本，不是校验通过的替代值 |
| fieldResults[].sourceRefs | SourceRef[] | 可选 | 字段材料来源 |

### 状态与消费规则

| fieldResults.status | 权威容器可有值 | 意义 |
|---|---|---|
| present | 是，非 null | 本轮检查的相关规则满足；0、false、空字符串可以合法 |
| explicit_null | 是，恰为 null | 用户明确空且 Schema 允许 |
| not_provided | 否 | 未提供，不按 Schema 默认值补齐 |
| unknown | 否 | 值、适用性或有效性尚不能确定 |
| not_applicable | 否 | 字段不适用于该意图 |
| invalid | 否 | 已知候选违反规则 |
| invalidated | 否 | 变化使旧值失效，尚无合法替代 |
| removed | 否 | 用户撤回参数要求，不是数据库删除操作 |

按 container + intentId + path 找值，不能把多订单字段合并到第一个意图。未选择且未变化的继承值可以保留，但没有本轮字段报告不代表重新验证通过。`fields=[]` 不会清空全部旧参数；默认无字段选择也不阻止意图识别。

## 问题、候选与推断

用 **Q** 表示 `issues[]`。

| 路径 | 类型 | 出现条件 | 含义与示例 |
|---|---|---|---|
| Q.id | string | 必有 | 本结果的问题身份，不是持久业务任务号 |
| Q.code | string | 必有 | 语义或字段问题码，见[错误参考](/api/errors) |
| Q.category | ambiguity/missing/conflict/data/context | 必有 | 问题分类，与异常 stage 不同 |
| Q.message | string | 必有 | 面向调用方的解释 |
| Q.container | inputs/facts/extensions | 可选 | 字段问题的归属容器 |
| Q.intentId | string | 可选 | 相关有效意图 ID |
| Q.field | string | 可选 | 相关顶层字段 |
| Q.path | string | 可选 | 相对字段所属容器的定位 |
| Q.sourceRefs | SourceRef[] | 可选 | 问题依据 |
| Q.candidates | IntentCandidate[] | 可选 | 有材料依据的未确认候选，不自行采用 |
| Q.candidates[].id | string | 候选必有 | 供同组 question.optionIds 引用 |
| Q.candidates[].description | string | 候选必有 | 候选内容 |
| Q.candidates[].intentId | string | 可选 | 已知的相关意图 |
| Q.candidates[].sourceRefs | SourceRef[] | 候选必有 | 候选来自哪份提供材料 |
| Q.questions | 问题数组 | 可选 | 调用方可据此澄清 |
| Q.questions[].question | string | 问题必有 | 要询问的内容 |
| Q.questions[].optionIds | string[] | 可选 | 同一问题组的候选 ID，不是数组位置永久标识 |
| inferences[].target | string | 必有 | 指向最终 Result 的 JSON Pointer |
| inferences[].candidate | JsonValue | 可选 | 未确认的候选值，不能自动提升为用户事实 |
| inferences[].explanation | string | 必有 | 为什么存在推断或不确定性 |
| inferences[].sourceRefs | SourceRef[] | 必有 | 推断的已有材料依据 |

## 来源、选项与诊断

用 **S** 表示任一 SourceRef。

| 路径 | 类型 | 出现条件 | 含义与示例 |
|---|---|---|---|
| S.root | input/context/baseline/schema/extensionSchema/semantics/referenceTime | 必有 | 本次提供材料的根，不是外部文件或 URL |
| S.pointer | string | 必有 | 相对该 root 的 JSON Pointer；input 通常为 '' |
| S.quote | string | 可选 | 对应材料的原文子串，不是模型新写的引文 |
| suggestions[].kind | clarification/semantic_improvement/conflict_warning | 建议必有 | 独立建议，不会新增正式目标 |
| suggestions[].text | string | 建议必有 | 建议文字 |
| suggestions[].relatesTo | string[] | 可选 | 相关对象 ID，不作为执行授权 |
| evidence[].target | string | 证据必有 | 相对整个最终 Result 的 JSON Pointer |
| evidence[].sourceRefs | SourceRef[] | 证据必有 | 对应字段或结构的材料来源 |
| diagnostics.durationMs | number | 可选 | 本次识别相关等待与处理耗时，不是性能保证 |
| diagnostics.modelCallCount | number | 可选 | 服务端 executor 调用数；host 为0，不统计宿主模型调用 |

JSON Pointer：空串指根，`/meta/` 指空属性名，`~0` 表示波浪号，`~1` 表示斜线；`/a~2b` 非法，`orders/1/amount` 不是指针。数组使用原始索引，不因过滤坏项重编号。来源在下一轮需相对本轮材料重新定位，不引用未续传的旧对象。

| 开关 | 默认 | 开启 | 关闭 |
|---|---|---|---|
| suggestions | false | 返回数组，无建议为 [] | 省略建议 |
| evidence | false | 返回数组，无证据为 [] | 省略详细证据，必要 issues/inferences 来源仍保留 |
| diagnostics | false | 返回诊断对象 | 省略诊断 |
| extensions | false | 按 extensionSchema 提取扩展标签 | 不新提取；I.extensions 仍必有，可处理旧值失效 |

`defaultOutput` 与请求 `output` 按键合并，显式 false 覆盖 true；`output:{}` 不清空默认设置。没有 extensionSchema 却开启 extensions 抛 SCHEMA_NOT_CONFIGURED。完整开关配置见[配置参考](/guide/configuration#输出选项)。

## 完整场景与多轮材料

每个文件包含完整 config、request、result；多轮文件带实际 baseline 和必要 Context。config 中不含模型凭据，运行时按[模型来源](/integrations/api)补执行器。它们是固定结构样例，不承诺真实模型逐字输出相同文字。

<a href="/intent-runtime/examples/scenarios.json" download target="_blank" rel="noopener noreferrer">下载全部场景</a>

| 场景 | 重点 | 完整输入与结果 |
|---|---|---|
| 只识别意图与约束 | 不配置 Schema 仍识别意图，fields 默认 [] | <a href="/intent-runtime/examples/basic-example.json" download target="_blank" rel="noopener noreferrer">下载 JSON</a> |
| 字符串订单编号 | 默认 Native 输出与前导零 | <a href="/intent-runtime/examples/native-example.json" download target="_blank" rel="noopener noreferrer">下载 JSON</a> |
| 条件未成立不提前撤回 | effect=conditional，保留目标和 conditionId | <a href="/intent-runtime/examples/conditional-example.json" download target="_blank" rel="noopener noreferrer">下载 JSON</a> |
| 多个订单各有归属 | 编号归各自意图 | <a href="/intent-runtime/examples/two-orders-example.json" download target="_blank" rel="noopener noreferrer">下载 JSON</a> |
| 父子需求与四类约束 | 四种约束、交付物、父子和显式关系 | <a href="/intent-runtime/examples/requirements-example.json" download target="_blank" rel="noopener noreferrer">下载 JSON</a> |
| 撤回子项并修改交付语言 | 旧 ID 只在 baseline，幸存身份及限制保留 | <a href="/intent-runtime/examples/withdraw-example.json" download target="_blank" rel="noopener noreferrer">下载 JSON</a> |
| VIP优惠：为订单000123设置VIP=true，优惠15 | VIP≤20，非VIP≤10，首轮字段全选 | <a href="/intent-runtime/examples/vip-example.json" download target="_blank" rel="noopener noreferrer">下载 JSON</a> |
| VIP优惠：这个订单改为非VIP，其他不变 | 只选 isVip，discount 旧值失效 | <a href="/intent-runtime/examples/vip-changed-example.json" download target="_blank" rel="noopener noreferrer">下载 JSON</a> |
| VIP优惠：优惠改为5 | 补充5并解除对应问题 | <a href="/intent-runtime/examples/vip-fixed-example.json" download target="_blank" rel="noopener noreferrer">下载 JSON</a> |
| 撤回字段要求 | 撤回参数要求，非业务删除 | <a href="/intent-runtime/examples/removed-example.json" download target="_blank" rel="noopener noreferrer">下载 JSON</a> |
| 没有操作的事实 | turn.facts，不虚构操作 | <a href="/intent-runtime/examples/facts-example.json" download target="_blank" rel="noopener noreferrer">下载 JSON</a> |
| 显式续传事实再查询 | 显式 Context 续传事实 | <a href="/intent-runtime/examples/fact-query-example.json" download target="_blank" rel="noopener noreferrer">下载 JSON</a> |
| 对象不明时澄清 | 没有列表不编造第三项 | <a href="/intent-runtime/examples/ambiguity-example.json" download target="_blank" rel="noopener noreferrer">下载 JSON</a> |
| 回答澄清仍保留禁止事项 | 回答后仍保留不改代码 | <a href="/intent-runtime/examples/answer-example.json" download target="_blank" rel="noopener noreferrer">下载 JSON</a> |
| 调用方材料中的多个候选 | 问题选项来自材料 | <a href="/intent-runtime/examples/candidates-example.json" download target="_blank" rel="noopener noreferrer">下载 JSON</a> |
| 第二个选项必须有对应材料 | 第二个必须有对应候选 | <a href="/intent-runtime/examples/chosen-example.json" download target="_blank" rel="noopener noreferrer">下载 JSON</a> |
| 推断不当作已确认事实 | candidate 不成为已确认 target | <a href="/intent-runtime/examples/inference-example.json" download target="_blank" rel="noopener noreferrer">下载 JSON</a> |
| 完整意图也可能有字段问题 | complete 可与字段无效共存 | <a href="/intent-runtime/examples/field-states-example.json" download target="_blank" rel="noopener noreferrer">下载 JSON</a> |
| 扩展标签与输出开关 | 扩展与附加输出，不新增业务参数 | <a href="/intent-runtime/examples/output-options-example.json" download target="_blank" rel="noopener noreferrer">下载 JSON</a> |

## Native、MCP 与 Host 封装

- Native `parse()` 正常返回 IntentResult，技术失败抛出 IntentError。
- executor MCP 的 intent_parse 成功把相同 IntentResult 放在 structuredContent，content 中为同一 JSON，isError=false。
- host 的 prepare 返回 HostTask，当前宿主生成 candidateText，accept 才返回最终 IntentResult；cancel 返回取消状态。候选不是最终响应。
- MCP 技术失败为 isError=true，content 文本包含 `{error: SerializedIntentError}`，不附 structuredContent 或 partialResult。
- 声明协议对应的额外信封字段和 SDK 协商见[MCP 接入](/api/mcp#协议与远程调用)，不把协议外层字段加到 Native IntentResult。

<a href="/intent-runtime/examples/executor-request.json" download target="_blank" rel="noopener noreferrer">executor 标准请求</a> · <a href="/intent-runtime/examples/executor-result.json" download target="_blank" rel="noopener noreferrer">executor 完整工具回复</a>

下面保留两组 Host 示例。文件中的 config 是独立 MCP 配置，request 是 prepare 参数；启用了 evidence 与 diagnostics，因此与上面的默认 Native 示例不同。耗时是该次样例记录，不是时延承诺。

<a href="/intent-runtime/examples/order-request.json" download target="_blank" rel="noopener noreferrer">Host 订单配置与请求</a> · <a href="/intent-runtime/examples/order-result.json" download target="_blank" rel="noopener noreferrer">Host 订单完整结果</a>

<a href="/intent-runtime/examples/clarification-request.json" download target="_blank" rel="noopener noreferrer">Host 澄清配置与请求</a> · <a href="/intent-runtime/examples/clarification-result.json" download target="_blank" rel="noopener noreferrer">Host 澄清完整结果</a>

同版本 `INTENT_RESULT_SCHEMA` 可验证响应形状，不能证明自然语言理解正确。对结果采取什么业务动作仍由调用方决定；[结果消费](/guide/results)与[多轮材料](/guide/multi-turn)给出处理步骤。
