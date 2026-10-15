# 完整响应结构

import {withBase} from '@rspress/core/runtime';

```ts
type IntentResult = {
  schemaVersion: '2.0-draft.6'; input: string; status: 'complete' | 'partial';
  turn: {kind: TurnKind; normalizedInput: string; intentIds: string[]; changes: IntentChange[]; facts: JsonObject};
  effective: {schemaVersion: '2.0-draft.6'; coverage: 'complete' | 'partial' | 'unavailable'; scope: 'current_request' | 'provided_materials'; intents: StructuredIntent[]; constraints: IntentConstraint[]; relations: IntentRelation[]; unresolved: string[]};
  fieldResults: FieldResult[]; issues: IntentIssue[]; inferences: IntentInference[];
  suggestions?: IntentSuggestion[]; evidence?: SourceEvidence[]; diagnostics?: IntentDiagnostics;
};
```

完整意图位于effective.intents及其children；turn.intentIds关联本轮目标，changes描述本轮变化。每个StructuredIntent必返id、domain/action/target（可null）、goal、understanding、constraints、inputs、references、children、extensions；optional、expectedOutput按材料省略或返回。understanding为clear/incomplete/ambiguous/conflicted。

| 部分 | 完整含义 |
|---|---|
| turn.kind | request/amendment/confirmation/rejection/withdrawal/answer/statement/mixed/unclear |
| turn.intentIds | 本轮相关意图 ID，不复制意图 |
| changes | operation=add/modify/confirm/reject/withdraw；effect=applied/conditional/unresolved；target 为意图/约束/关系 ID 或未定位说明；description/sourceRefs 必返 |
| changes.deltas | applied 时可有 path、set/remove、可选 before 和 set 的 after；取自旧材料和最终对象，不由模型原样覆盖 |
| conditional | conditionId 必返，保留条件与目标，不伪装已经撤回 |
| constraints | id/kind/text/scope，kind=prohibition/requirement/precondition/preference；scope=global/intent/phase/target；可有 comparison/all/any/not expression |
| references | id/kind/ref/resolved；kind=intent/entity/source；可有 description/sourceRefs；指向明确材料或实体，不自动查询 |
| relations | id/fromId/toId/kind；kind=before/depends_on/parallel/exclusive/conditional；conditional 含 condition；父子仅用 children |
| unresolved | 当前未解决问题的文字摘要数组；不是issue ID或持久问题表，详情和候选在issues |
| fieldResults | container=inputs/facts/extensions、intentId（facts 为 null）、field/path/status/trigger；可有 explanation/rawText/sourceRefs |
| field status | present/explicit_null/not_provided/unknown/not_applicable/invalid/invalidated/removed |
| trigger | selection/invalidation |
| issues | id/code/category/message；可有 intentId/container/field/path/sourceRefs/candidates/questions；category=ambiguity/missing/conflict/data/context |
| inferences | target（最终结果 JSON Pointer）、explanation/sourceRefs，可有 candidate；evidence 关闭仍保留必要推断 |
| evidence | 开关开启时的 target/sourceRefs |
| suggestions | clarification/semantic_improvement/conflict_warning，text，可有 relatesTo；不是新实施目标 |
| diagnostics | 开关开启时的 durationMs/modelCallCount；host 不调用服务端模型，计数 0 |

SourceRef 使用 root/pointer 和可选 quote，必须指向本次 input/context/baseline/schema/extensionSchema/semantics/referenceTime 材料；quote 是原文子串，历史引用需要重定位到当前材料。JSON Pointer 保留空属性名、`~0`、`~1` 与原数组索引。

`status=partial` 由必要语义不确定性汇总。字段缺失、无效或算法无法证明可与完整意图共存。消费 inputs 前同时检查所属意图、fieldResults 与问题，不用 complete 代替业务授权。

完整 TypeScript 定义见 [完整类型参考](/api/types)，并随发行包提供；INTENT_RESULT_SCHEMA 是同版本完整 Draft-07 数据，包括全部本地定义，可供消费者验证形状。它不证明语义正确。

## 状态与消费规则

| fieldResults.status | 权威容器可有值 | 意义 |
|---|---|---|
| present | 是，非null | 有依据且适用的本轮已检查规则满足；0/false/空字符串等可合法 |
| explicit_null | 是，恰为null | 用户明确空且Schema允许 |
| not_provided | 否 | 没有提供，不补默认 |
| unknown | 否 | 值/适用性/有效性无法确定 |
| not_applicable | 否 | 不适用于此意图 |
| invalid | 否 | 已有候选不满足规则 |
| invalidated | 否 | 旧值因变化失效，本轮无合法替代 |
| removed | 否 | 用户明确撤回参数要求，不是业务数据库删除 |

非present状态提供explanation。container+intentId+path唯一；path相对inputs/facts/extensions容器，数组坏项保留原索引。没有字段报告的继承值不代表通过本轮Schema复验。

变化target.kind为unresolved时effect也是unresolved，可保留conditionId；conditional必须有conditionId、不得有deltas；applied不得有conditionId，deltas可选且path相对变化对象。remove与set为null不同。变化目标可为已撤回的旧对象，不能据effective不存在就丢失withdraw记录。

关系before表示from先于to；depends_on表示from依赖to。父级限制按作用域继承，不复制成多份权威约束。expectedOutput是明确交付物/成功标准，不承载重复的行为限制。

以下示例对应显式提供的请求，ID整理为便于阅读的名称，原文及来源保持对应。下载文件中的config是独立MCP服务配置，request是intent_prepare参数；将config内容保存为可信.mjs的默认导出后，按[host流程](/integrations/codex)调用。可选diagnostics中的modelCallCount=0表示未调用额外服务端执行器；耗时不是性能保证。完整度只针对相关材料，不是全部业务状态。续传事实、问题和候选见[多轮对话](/guide/multi-turn)。

## 完整字段结果

输入：查询订单000741，不要把编号转成数字。

<a href={withBase('/examples/order-request.json')} download>配置与请求</a> · <a href={withBase('/examples/order-result.json')} download>下载完整结果</a>

<details>
<summary>展开完整 JSON</summary>

```json
{
  "schemaVersion": "2.0-draft.6",
  "input": "查询订单000741，不要把编号转成数字。",
  "status": "complete",
  "turn": {
    "kind": "request",
    "normalizedInput": "查询订单编号为字符串“000741”的订单，保留前导零，不得把编号转成数字。",
    "intentIds": [
      "intent-1"
    ],
    "changes": [
      {
        "operation": "add",
        "target": {
          "kind": "intent",
          "id": "intent-1"
        },
        "description": "新增查询订单000741的意图。",
        "sourceRefs": [
          {
            "root": "input",
            "pointer": "",
            "quote": "查询订单000741"
          }
        ],
        "effect": "applied"
      },
      {
        "operation": "add",
        "target": {
          "kind": "constraint",
          "id": "constraint-1"
        },
        "description": "新增禁止将订单编号转成数字的约束。",
        "sourceRefs": [
          {
            "root": "input",
            "pointer": "",
            "quote": "不要把编号转成数字"
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
        "id": "intent-1",
        "domain": "order",
        "action": "query",
        "target": "000741",
        "goal": "查询订单000741。",
        "understanding": "clear",
        "constraints": [
          {
            "id": "constraint-1",
            "kind": "prohibition",
            "text": "不得把订单编号000741转成数字，须保留其字符串形式及前导零。",
            "scope": {
              "type": "intent",
              "intentId": "intent-1"
            }
          }
        ],
        "inputs": {
          "orderId": "000741"
        },
        "references": [],
        "children": [],
        "extensions": {},
        "optional": false
      }
    ],
    "constraints": [],
    "relations": [],
    "unresolved": []
  },
  "fieldResults": [
    {
      "container": "inputs",
      "intentId": "intent-1",
      "field": "orderId",
      "path": "/orderId",
      "status": "present",
      "trigger": "selection",
      "rawText": "000741",
      "sourceRefs": [
        {
          "root": "input",
          "pointer": "",
          "quote": "000741"
        }
      ]
    }
  ],
  "issues": [],
  "inferences": [],
  "evidence": [
    {
      "target": "/effective/intents/0/goal",
      "sourceRefs": [
        {
          "root": "input",
          "pointer": "",
          "quote": "查询订单000741"
        }
      ]
    },
    {
      "target": "/effective/intents/0/inputs/orderId",
      "sourceRefs": [
        {
          "root": "input",
          "pointer": "",
          "quote": "000741"
        }
      ]
    },
    {
      "target": "/effective/intents/0/constraints/0/text",
      "sourceRefs": [
        {
          "root": "input",
          "pointer": "",
          "quote": "不要把编号转成数字"
        }
      ]
    }
  ],
  "diagnostics": {
    "durationMs": 30162.873389999997,
    "modelCallCount": 0
  }
}
```

</details>

## 局部不确定结果

输入：采用第三个提案，提案列表未提供；不要修改配置。

<a href={withBase('/examples/clarification-request.json')} download>配置与请求</a> · <a href={withBase('/examples/clarification-result.json')} download>下载完整结果</a>

<details>
<summary>展开完整 JSON</summary>

```json
{
  "schemaVersion": "2.0-draft.6",
  "input": "采用第三个提案，提案列表未提供；不要修改配置。",
  "status": "partial",
  "turn": {
    "kind": "request",
    "normalizedInput": "请求采用第三个提案，但提案列表未提供，无法确定具体提案；要求不要修改配置。",
    "intentIds": [
      "intent-1"
    ],
    "changes": [
      {
        "operation": "add",
        "target": {
          "kind": "intent",
          "id": "intent-1"
        },
        "description": "新增采用第三个提案的请求；所指提案仍未解析，不表明此前已有选择。",
        "sourceRefs": [
          {
            "root": "input",
            "pointer": "",
            "quote": "采用第三个提案"
          },
          {
            "root": "input",
            "pointer": "",
            "quote": "提案列表未提供"
          }
        ],
        "effect": "applied"
      },
      {
        "operation": "add",
        "target": {
          "kind": "constraint",
          "id": "constraint-1"
        },
        "description": "添加不要修改配置的禁止要求。",
        "sourceRefs": [
          {
            "root": "input",
            "pointer": "",
            "quote": "不要修改配置"
          }
        ],
        "effect": "applied"
      }
    ],
    "facts": {}
  },
  "effective": {
    "schemaVersion": "2.0-draft.6",
    "coverage": "partial",
    "scope": "current_request",
    "intents": [
      {
        "id": "intent-1",
        "domain": null,
        "action": "采用",
        "target": null,
        "goal": "采用第三个提案",
        "understanding": "ambiguous",
        "constraints": [],
        "inputs": {},
        "references": [
          {
            "id": "reference-1",
            "kind": "source",
            "ref": null,
            "resolved": false,
            "description": "第三个提案所对应的提案列表未提供，具体提案无法确定。",
            "sourceRefs": [
              {
                "root": "input",
                "pointer": "",
                "quote": "采用第三个提案"
              },
              {
                "root": "input",
                "pointer": "",
                "quote": "提案列表未提供"
              }
            ]
          }
        ],
        "children": [],
        "extensions": {},
        "optional": false
      }
    ],
    "constraints": [
      {
        "id": "constraint-1",
        "kind": "prohibition",
        "text": "不要修改配置。",
        "scope": {
          "type": "global"
        }
      }
    ],
    "relations": [],
    "unresolved": [
      "缺少提案列表，无法解析“第三个提案”所指的具体提案。",
      "当前请求引用的提案列表明确未提供，材料不足以确定所选提案。"
    ]
  },
  "fieldResults": [],
  "issues": [
    {
      "id": "issue-1",
      "code": "AMBIGUOUS_REFERENCE",
      "category": "ambiguity",
      "message": "缺少提案列表，无法解析“第三个提案”所指的具体提案。",
      "intentId": "intent-1",
      "sourceRefs": [
        {
          "root": "input",
          "pointer": "",
          "quote": "采用第三个提案"
        },
        {
          "root": "input",
          "pointer": "",
          "quote": "提案列表未提供"
        }
      ],
      "questions": [
        {
          "question": "请提供按顺序排列的提案列表或第三个提案的内容。"
        }
      ]
    },
    {
      "id": "issue-2",
      "code": "CONTEXT_INCOMPLETE",
      "category": "context",
      "message": "当前请求引用的提案列表明确未提供，材料不足以确定所选提案。",
      "intentId": "intent-1",
      "sourceRefs": [
        {
          "root": "input",
          "pointer": "",
          "quote": "提案列表未提供"
        }
      ]
    }
  ],
  "inferences": [],
  "evidence": [
    {
      "target": "/effective/intents/0",
      "sourceRefs": [
        {
          "root": "input",
          "pointer": "",
          "quote": "采用第三个提案"
        },
        {
          "root": "input",
          "pointer": "",
          "quote": "提案列表未提供"
        }
      ]
    },
    {
      "target": "/effective/constraints/0",
      "sourceRefs": [
        {
          "root": "input",
          "pointer": "",
          "quote": "不要修改配置"
        }
      ]
    }
  ],
  "diagnostics": {
    "durationMs": 31622.39843,
    "modelCallCount": 0
  }
}
```

</details>
