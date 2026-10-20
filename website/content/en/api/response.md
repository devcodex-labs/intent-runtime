<span id="完整响应结构" aria-hidden="true"></span>

# Response reference

What is returned, when does it appear, and how should you consume it? Start with [Quick start](/guide/quick-start) and [Read the result](/guide/results). All declarations are in [TypeScript types](/api/types).

| Check | Section |
|---|---|
| Goals, prohibitions, changes | [turn](#turn-and-changes), [effective](#effective-understanding) |
| Parameter ownership and false/null | [States](#states-and-consumption) |
| Ambiguity, candidates, unconfirmed inference | [Issues and inferences](#issues-candidates-and-inferences) |
| Full configuration, request, result | [Scenario downloads](#complete-scenarios-and-multi-turn-material) |
| MCP outer replies | [Protocol reference](/api/mcp#success-and-error-envelopes) |

Import public types and use indexed access for field types:

<!-- typecheck -->
```ts
import type {IntentResult, TurnUnderstanding} from '@devcodex/intent-runtime';

type Response = IntentResult;

type TurnKind = TurnUnderstanding['kind'];
```

<span id="默认-native-调用与结果" aria-hidden="true"></span>

## Default Native call and result

Set environment variables using [model configuration](/guide/quick-start#2-configure-the-model). Save the complete file and run node native-response-en.mjs in your application. It selects orderId; suggestions, detailed evidence, diagnostics, and extension extraction are disabled by default.

<!-- example: examples/api/native-response-en.mjs -->
```js
import {Intent, IntentError} from '@devcodex/intent-runtime';
import {createApiExecutor} from '@devcodex/intent-runtime/adapters/api';

const apiKey = process.env.INTENT_API_KEY, model = process.env.INTENT_MODEL;
if (!apiKey || !model) throw new Error('Set INTENT_API_KEY and INTENT_MODEL in your environment.');
const intent = new Intent({
  language: 'en',
  executor: createApiExecutor({provider: 'openai', apiKey, model}),
  schema: {type: 'object', properties: {orderId: {type: 'string', pattern: '^[0-9]+$'}}},
});
try {
  const result = await intent.parse({input: 'Look up order 000123. Do not cancel the order.', fields: ['orderId']});
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  if (!(error instanceof IntentError)) throw error;
  console.error(JSON.stringify(error.toJSON()));
  process.exitCode = 1;
} finally {await intent.dispose();}
```

This table is a **reading summary of selected fields**. Full responses do not omit required objects or arrays.

| Meaning | Location | Example |
|---|---|---|
| Current request | turn.kind | request |
| Goal | effective.intents[0].goal | Look up order 000123 |
| Prohibition | effective.intents[0].constraints | prohibition: do not cancel the order |
| Parameter and ownership | effective.intents[0].inputs.orderId | String "000123" |
| Current field check | fieldResults[] | present, linked to the owning intent ID |
| Clarification issues | issues | [] |

This fixed candidate passed through the actual core and schema-dsl Validator. Opaque IDs are consistently renamed for readability. Actual model wording and IDs vary. No order query or cancellation is executed.

<a href="/intent-runtime/examples/en/native-request.json" download target="_blank" rel="noopener noreferrer">Native configuration and request</a> · <a href="/intent-runtime/examples/en/native-result.json" download target="_blank" rel="noopener noreferrer">Complete Native result</a>

<details>
<summary>Expand the complete default Native result</summary>

<!-- result: native -->
```json
{
  "schemaVersion": "2.0-draft.6",
  "input": "Look up order 000123. Do not cancel the order.",
  "status": "complete",
  "turn": {
    "kind": "request",
    "normalizedInput": "Look up order 000123. Do not cancel the order.",
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
        "description": "Add the explicit request from this turn",
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
        "description": "Add the explicit request from this turn",
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
        "action": "Look up",
        "target": "order 000123",
        "goal": "Look up order 000123",
        "understanding": "clear",
        "constraints": [
          {
            "id": "constraint-2",
            "kind": "prohibition",
            "text": "Do not cancel the order",
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

<span id="根级字段" aria-hidden="true"></span>

## Root fields

Required fields always occur in a normal IntentResult, using [] or {} when empty. Optional fields may be omitted; that does not mean null. Nullable locations such as domain/action/target and intentId are listed explicitly. Technical failures use exceptions/error envelopes rather than incomplete success objects.

| Path | Type | Presence | Meaning |
|---|---|---|---|
| schemaVersion | '2.0-draft.6' | required | Result format version, not npm version or request sequence |
| input | string | required | Original input; normalizedInput does not replace it |
| status | 'complete' or 'partial' | required | Understanding completeness, not field validity, authorization, or execution |
| turn | TurnUnderstanding | required | Current semantics, associations, changes, facts |
| effective | EffectiveIntentSnapshot | required | Unique effective goal tree and constraints from relevant material |
| fieldResults | FieldResult[] | required | Selected-field and old-value invalidation reports; may be empty with fields=[] |
| issues | IntentIssue[] | required | Semantic, field, and context issues; [] when none |
| inferences | IntentInference[] | required | Unconfirmed inferences, not user facts; [] when none |
| suggestions | IntentSuggestion[] | suggestions enabled | [] when none; omitted when disabled |
| evidence | SourceEvidence[] | evidence enabled | Detailed sources, [] when none; disabling retains necessary sources |
| diagnostics | IntentDiagnostics | diagnostics enabled | Diagnostic object; omitted when disabled |

<span id="本轮-turn-与变更" aria-hidden="true"></span>

## turn and changes

| Path | Type | Presence | Meaning |
|---|---|---|---|
| turn.kind | TurnUnderstanding['kind'] | required | request/amendment/confirmation/rejection/withdrawal/answer/statement/mixed/unclear |
| turn.normalizedInput | string | required | Faithful restatement without invented business steps or facts |
| turn.intentIds | string[] | required | Associated current effective intents; withdrawn targets are absent |
| turn.changes | IntentChange[] | required | Associations/changes caused by current input, not execution commands |
| turn.facts | JsonObject | required | Selected facts without an operation intent; no automatic unselected extraction |
| turn.changes[].operation | add/modify/withdraw/confirm/reject | required | Read together with effect |
| turn.changes[].effect | applied/conditional/unresolved | required | Reflected in the interpretation, conditional, or not yet located |
| turn.changes[].target | ChangeTarget | required | Changed object; see the union below |
| turn.changes[].target.kind | intent/constraint/relation/unresolved | required | Object category; IDs cannot be mixed across kinds |
| turn.changes[].target.id | string | required unless unresolved | Current object or explicitly withdrawn old object found only in prior material |
| turn.changes[].target.description | string | required when unresolved | Description of an unlocated target without an invented ID |
| turn.changes[].description | string | required | Explanation of the current change |
| turn.changes[].sourceRefs | SourceRef[] | required | Sources from this turn's input |
| turn.changes[].conditionId | string | required for conditional; optional for unresolved | Current constraint ID; forbidden for applied |
| turn.changes[].deltas | IntentDelta[] | optional only for applied | Actual local differences on known objects; forbidden for other effects |
| turn.changes[].deltas[].path | string | required for a delta | JSON Pointer relative to the changed object, not the whole Result |
| turn.changes[].deltas[].operation | set/remove | required for a delta | Interpretation update/removal, not a database operation |
| turn.changes[].deltas[].before | JsonValue | optional | Reliable old value when known; omission does not mean null |
| turn.changes[].deltas[].after | JsonValue | required for set; forbidden for remove | null is a valid set value, distinct from removal |

applied means interpretation changed. conditional retains the condition and target without premature withdrawal. A withdrawn target may be absent from new effective; do not discard the valid withdrawal. changes does not promise every internal difference such as context relocation and is not a generic business-state patch.

Every conditionId must resolve to a current effective-global or node constraint, including when effect=unresolved; an ID found only in prior material is insufficient. Candidate writers use `conditionKey: null` to omit a condition; an empty supplied key is invalid and is never silently discarded. A withdrawal turn must contain a valid intent withdrawal or an unresolved withdrawal describing its unlocated target. Other retained goals and protective constraints can remain.

Deltas are optional and need not enumerate all differences. A set with a reliably known identical old value, or a remove of a path known absent from the complete baseline, is rejected as a candidate inconsistency. Object key order does not create a difference. A path omitted from partial Context does not prove old absence; before stays optional. Real removals, array shifts and setting null remain distinct valid operations.

Global constraints have no owning intent. Host/custom-executor candidates must use ownerKey=null for global scope; a contradictory non-null owner is rejected rather than silently discarded or converted to another scope.

<span id="有效理解-effective" aria-hidden="true"></span>

## Effective understanding

| Path | Type | Presence | Meaning |
|---|---|---|---|
| effective.schemaVersion | '2.0-draft.6' | required | Format version for the next baseline |
| effective.coverage | complete/partial/unavailable | required | Coverage of relevant history/material, distinct from root status |
| effective.scope | current_request/provided_materials | required | Current request only, or supplied relevant historical material |
| effective.intents | StructuredIntent[] | required | Top-level intents; full intents live only in this tree |
| effective.constraints | IntentConstraint[] | required | Global constraints; per-node constraints alone are insufficient |
| effective.relations | IntentRelation[] | required | Explicit ordering/dependencies; hierarchy uses children only |
| effective.unresolved | string[] | required | Text summaries of unresolved questions, not issue IDs |

**I** means effective.intents[] or recursive I.children[]. **C** means effective.constraints[] or I.constraints[]. These are documentation path templates, not extra response fields.

| Path | Type | Presence | Meaning |
|---|---|---|---|
| I.id | string | required | Goal identity retained with explicit prior material and continuity; not a permanent cross-system business ID |
| I.domain | string or null | required | Domain; null when undetermined, without invention |
| I.action | string or null | required | Requested action; configured business identifiers are not translated |
| I.target | string or null | required | Action object; nullable while unresolved |
| I.goal | string | required | Natural-language user goal, not an implementation plan |
| I.understanding | clear/ambiguous/incomplete/conflicted | required | Node understanding, distinct from field validity |
| I.constraints | IntentConstraint[] | required | Constraints within explicit scope; account for parents and globals |
| I.inputs | JsonObject | required | Selected business parameters; {} without new values; use fieldResults for usability |
| I.optional | boolean | optional | User-expressed optionality, not arbitrary runtime permission to omit |
| I.expectedOutput | string[] | optional | Explicit deliverables/success criteria, not duplicated requirements |
| I.references | IntentReference[] | required | Object/material references used by this intent |
| I.children | StructuredIntent[] | required | Unique parent-child containment; [] without children |
| I.extensions | JsonObject | required | Semantic labels; {} by default; cannot bypass fields for business parameters |
| C.id | string | required | Constraint identity referenced by changes/conditions |
| C.kind | requirement/prohibition/precondition/preference | required | Positive requirement, prohibition, precondition, or preference |
| C.text | string | required | Original constraint meaning, such as requiring email verification |
| C.scope | ConstraintScope | required | Applicability without duplicated authoritative constraints |
| C.scope.type | global/intent/phase/target | required | Global tree, intent, explicit phase, or referenced object |
| C.scope.intentId | string | required for intent/phase/target | Owning effective intent; absent for global |
| C.scope.referenceId | string | required for target | Reference ID within the owning intent's references |
| C.expression | StructuredExpression | optional | Supported structured logic; omission does not make a condition true |

<span id="要求限制与交付物" aria-hidden="true"></span>

### Requirements, constraints, and deliverables

“Sign-in requires an email code” is requirement; “do not modify the database” is prohibition; “enable only after approval” is precondition; “prefer existing styles” is preference. “Deliver Chinese user instructions” belongs to expectedOutput. There is no separate requirements array.

Download the <a href="/intent-runtime/examples/en/requirements-example.json" download target="_blank" rel="noopener noreferrer">parent/child example</a>, containing all four kinds, a goal tree, explicit parallel relation, and deliverable.

<details>
<summary>Expand the complete parent/child result</summary>

<!-- result: requirements -->
```json
{
  "schemaVersion": "2.0-draft.6",
  "input": "Implement the user module with sign-in and registration that can be developed in parallel. Sign-in requires an email verification code and must be enabled only after approval; prefer the existing styles. Do not modify the database anywhere in the module. Deliver Chinese user instructions.",
  "status": "complete",
  "turn": {
    "kind": "request",
    "normalizedInput": "Implement the user module with sign-in and registration that can be developed in parallel. Sign-in requires an email verification code and must be enabled only after approval; prefer the existing styles. Do not modify the database anywhere in the module. Deliver Chinese user instructions.",
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
        "description": "Add the explicit request from this turn",
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
        "description": "Add the explicit request from this turn",
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
        "description": "Add the explicit request from this turn",
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
        "description": "Add the explicit request from this turn",
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
        "description": "Add the explicit request from this turn",
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
        "description": "Add the explicit request from this turn",
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
        "description": "Add the explicit request from this turn",
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
        "description": "Add the explicit request from this turn",
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
        "action": "Implement",
        "target": "the user module",
        "goal": "Implement the user module",
        "understanding": "clear",
        "constraints": [
          {
            "id": "constraint-4",
            "kind": "prohibition",
            "text": "Do not modify the database",
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
            "action": "Implement",
            "target": "sign-in",
            "goal": "Implement sign-in",
            "understanding": "clear",
            "constraints": [
              {
                "id": "constraint-5",
                "kind": "requirement",
                "text": "Sign-in requires an email verification code",
                "scope": {
                  "type": "intent",
                  "intentId": "intent-6"
                }
              },
              {
                "id": "constraint-6",
                "kind": "precondition",
                "text": "Enable sign-in only after approval",
                "scope": {
                  "type": "intent",
                  "intentId": "intent-6"
                }
              },
              {
                "id": "constraint-7",
                "kind": "preference",
                "text": "Prefer the existing styles",
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
            "action": "Implement",
            "target": "registration",
            "goal": "Implement registration",
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
          "Chinese user instructions"
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

<span id="表达式" aria-hidden="true"></span>

### Expressions

**E** means C.expression or recursive child expressions. **O** means a comparison's left/right operand.

| Path | Type | Presence | Meaning |
|---|---|---|---|
| E.type | comparison/all/any/not | required for an expression | Comparison, conjunction, disjunction, negation |
| E.left | ExpressionOperand | required for comparison | Left operand; no implicit business lookup |
| E.operator | eq/neq/gt/gte/lt/lte | required for comparison | Explicit comparison relation |
| E.right | ExpressionOperand | required for comparison | Right operand |
| E.items | StructuredExpression[] | required for all/any | Nonempty expressions preserving AND/OR grouping |
| E.item | StructuredExpression | required for not | One negated expression |
| O.type | literal/input/source | required for an operand | Constant, intent parameter, or supplied material |
| O.value | JsonValue | required for literal | JSON literal, including null |
| O.intentId | string | required for input | Effective intent owning the parameter |
| O.path | string | required for input | JSON Pointer relative to that intent's inputs |
| O.ref | SourceRef | required for source | Explicit location in supplied material |

<span id="引用与关系" aria-hidden="true"></span>

### References and relations

**R** means I.references[].

| Path | Type | Presence | Meaning |
|---|---|---|---|
| R.id | string | required | Reference identity inside its intent, used by target scope |
| R.kind | intent/entity/source | required | Intent, business entity, or source reference |
| R.ref | string or null | required | Known referenced object; null if unresolved, no invented entity ID |
| R.resolved | boolean | required | Resolution, not authorization or executability |
| R.description | string | optional | Human-readable reference explanation |
| R.sourceRefs | SourceRef[] | optional | Sources for the object location/reference |
| effective.relations[].id | string | required | Relation identity usable by changes |
| effective.relations[].fromId | string | required | Source effective intent ID |
| effective.relations[].toId | string | required | Target effective intent ID |
| effective.relations[].kind | before/depends_on/parallel/exclusive/conditional | required | before: from precedes to; depends_on: from depends on to; independence does not imply parallelism |
| effective.relations[].condition | string | required for conditional | Explicit condition text; absent from other relation kinds |

<span id="字段与状态" aria-hidden="true"></span>

## Fields and states

| Path | Type | Presence | Meaning |
|---|---|---|---|
| fieldResults[].container | inputs/facts/extensions | required | Container holding the authoritative value |
| fieldResults[].intentId | string or null | required | Owning intent for inputs/extensions; null for facts |
| fieldResults[].field | string | required | Selected or invalidated top-level field |
| fieldResults[].path | string | required | Container-relative JSON Pointer preserving nested locations/original array indices |
| fieldResults[].trigger | selection/invalidation | required | Current selection or inherited-value invalidation |
| fieldResults[].status | see below | required | Current check for this binding |
| fieldResults[].explanation | string | provided unless present | Why missing, invalid, inapplicable, or otherwise unresolved |
| fieldResults[].rawText | string | optional | Retained original field text, not a validated replacement |
| fieldResults[].sourceRefs | SourceRef[] | optional | Sources for the field material |

<span id="状态与消费规则" aria-hidden="true"></span>

### States and consumption

| fieldResults.status | Value in authoritative container? | Meaning |
|---|---|---|
| present | Yes, non-null | Applicable rules checked this turn; 0, false, and empty strings may be valid |
| explicit_null | Yes, exactly null | User explicitly supplied null and Schema permits it |
| not_provided | No | Absent; do not fill Schema defaults |
| unknown | No | Value, applicability, or validity is not established |
| not_applicable | No | Field does not apply to this intent |
| invalid | No | Known candidate violates a rule |
| invalidated | No | A change invalidated an old value with no valid replacement |
| removed | No | User withdrew the parameter requirement; not a database deletion |

Locate values with container + intentId + path. Do not merge multiple orders into the first goal. Unselected, unchanged inherited values may remain, but an absent current field report does not prove revalidation. fields=[] does not clear every old parameter or disable intent recognition.

<span id="问题候选与推断" aria-hidden="true"></span>

## Issues, candidates, and inferences

**Q** means issues[].

| Path | Type | Presence | Meaning |
|---|---|---|---|
| Q.id | string | required | Issue identity within this result, not a persistent business task ID |
| Q.code | string | required | Semantic/field issue code; see [Errors](/api/errors) |
| Q.category | ambiguity/missing/conflict/data/context | required | Issue category, distinct from exception stage |
| Q.message | string | required | Caller-facing explanation |
| Q.container | inputs/facts/extensions | optional | Field issue's owning container |
| Q.intentId | string | optional | Related effective intent ID |
| Q.field | string | optional | Related top-level field |
| Q.path | string | optional | Location relative to the field's container |
| Q.sourceRefs | SourceRef[] | optional | Supporting material for the issue |
| Q.candidates | IntentCandidate[] | optional | Unconfirmed, material-supported candidates; never automatically adopted |
| Q.candidates[].id | string | required for a candidate | Referenced by question.optionIds in the same group |
| Q.candidates[].description | string | required for a candidate | Candidate content |
| Q.candidates[].intentId | string | optional | Known related intent |
| Q.candidates[].sourceRefs | SourceRef[] | required for a candidate | Supplied material supporting the candidate |
| Q.questions | question array | optional | Questions the caller can ask |
| Q.questions[].question | string | required for a question | What to ask |
| Q.questions[].optionIds | string[] | optional | Same-group candidate IDs, not permanent array-position identities |
| inferences[].target | string | required | JSON Pointer into the final Result |
| inferences[].candidate | JsonValue | optional | Unconfirmed value, not automatically a user fact |
| inferences[].explanation | string | required | Reason for inference or uncertainty |
| inferences[].sourceRefs | SourceRef[] | required | Existing supplied material supporting the inference |

<span id="来源选项与诊断" aria-hidden="true"></span>

## Sources, options, and diagnostics

**S** means any SourceRef.

| Path | Type | Presence | Meaning |
|---|---|---|---|
| S.root | input/context/baseline/schema/extensionSchema/semantics/referenceTime | required | Root of supplied material, not an external file/URL |
| S.pointer | string | required | Root-relative JSON Pointer; input usually uses the empty string |
| S.quote | string | optional | Verbatim substring from the material, not a newly generated quotation |
| suggestions[].kind | clarification/semantic_improvement/conflict_warning | required for a suggestion | Independent suggestion without adding a formal goal |
| suggestions[].text | string | required for a suggestion | Suggestion text |
| suggestions[].relatesTo | string[] | optional | Related object IDs, not execution authorization |
| evidence[].target | string | required for evidence | JSON Pointer relative to the entire final Result |
| evidence[].sourceRefs | SourceRef[] | required for evidence | Material sources for the corresponding structure/field |
| diagnostics.durationMs | number | optional | Recognition waiting/processing duration, not a performance guarantee |
| diagnostics.modelCallCount | number | optional | Server-side executor calls; host=0 excludes client model calls |

JSON Pointer: the empty string names the root; /meta/ names an empty property; ~0 escapes a tilde and ~1 a slash. /a~2b is invalid; orders/1/amount lacks the required leading slash. Array pointers retain original indices. On the next turn, sources must be relocated into current supplied material rather than absent old objects.

| Option | Default | Enabled | Disabled |
|---|---|---|---|
| suggestions | false | Array, [] when none | Omitted |
| evidence | false | Array, [] when none | Detailed evidence omitted; necessary issues/inferences sources remain |
| diagnostics | false | Diagnostic object | Omitted |
| extensions | false | Extract extensionSchema labels | No new extraction; I.extensions remains required and old-value invalidation still applies |

defaultOutput and request output merge per key; explicit false overrides true. output:{} does not clear defaults. Enabling extensions without extensionSchema throws SCHEMA_NOT_CONFIGURED. See [Configuration](/guide/configuration#output-options).

<span id="完整场景与多轮材料" aria-hidden="true"></span>

## Complete scenarios and multi-turn material

Every scenario includes full config, request, and result; multi-turn examples include actual baseline and relevant context. Configurations omit model credentials; supply an [executor](/integrations/api) to run them. These are fixed structural examples, not a promise of verbatim model output.

<a href="/intent-runtime/examples/en/scenarios.json" download target="_blank" rel="noopener noreferrer">Download all scenarios</a>

| Scenario | Complete input and result |
|---|---|
| Recognize goals and constraints without a business Schema | <a href="/intent-runtime/examples/en/basic-example.json" download target="_blank" rel="noopener noreferrer">Download JSON</a> |
| Preserve the order ID as a string | <a href="/intent-runtime/examples/en/native-example.json" download target="_blank" rel="noopener noreferrer">Download JSON</a> |
| Do not withdraw before a condition is established | <a href="/intent-runtime/examples/en/conditional-example.json" download target="_blank" rel="noopener noreferrer">Download JSON</a> |
| Keep each order ID with its owning goal | <a href="/intent-runtime/examples/en/two-orders-example.json" download target="_blank" rel="noopener noreferrer">Download JSON</a> |
| Parent and child goals with four constraint kinds | <a href="/intent-runtime/examples/en/requirements-example.json" download target="_blank" rel="noopener noreferrer">Download JSON</a> |
| Withdraw a child goal and change the deliverable language | <a href="/intent-runtime/examples/en/withdraw-example.json" download target="_blank" rel="noopener noreferrer">Download JSON</a> |
| VIP discount: Set VIP=true and discount=15 for order 000123 | <a href="/intent-runtime/examples/en/vip-example.json" download target="_blank" rel="noopener noreferrer">Download JSON</a> |
| VIP discount: Change this order to non-VIP; keep everything else | <a href="/intent-runtime/examples/en/vip-changed-example.json" download target="_blank" rel="noopener noreferrer">Download JSON</a> |
| VIP discount: Change the discount to 5 | <a href="/intent-runtime/examples/en/vip-fixed-example.json" download target="_blank" rel="noopener noreferrer">Download JSON</a> |
| Withdraw a field requirement | <a href="/intent-runtime/examples/en/removed-example.json" download target="_blank" rel="noopener noreferrer">Download JSON</a> |
| A fact without an operation | <a href="/intent-runtime/examples/en/facts-example.json" download target="_blank" rel="noopener noreferrer">Download JSON</a> |
| Supply the previous fact explicitly for a lookup | <a href="/intent-runtime/examples/en/fact-query-example.json" download target="_blank" rel="noopener noreferrer">Download JSON</a> |
| Clarify an unresolved reference | <a href="/intent-runtime/examples/en/ambiguity-example.json" download target="_blank" rel="noopener noreferrer">Download JSON</a> |
| Keep prohibitions when answering a clarification | <a href="/intent-runtime/examples/en/answer-example.json" download target="_blank" rel="noopener noreferrer">Download JSON</a> |
| Multiple candidates from caller-supplied material | <a href="/intent-runtime/examples/en/candidates-example.json" download target="_blank" rel="noopener noreferrer">Download JSON</a> |
| The second option requires the corresponding material | <a href="/intent-runtime/examples/en/chosen-example.json" download target="_blank" rel="noopener noreferrer">Download JSON</a> |
| Keep an inference separate from confirmed facts | <a href="/intent-runtime/examples/en/inference-example.json" download target="_blank" rel="noopener noreferrer">Download JSON</a> |
| Complete understanding can still contain field issues | <a href="/intent-runtime/examples/en/field-states-example.json" download target="_blank" rel="noopener noreferrer">Download JSON</a> |
| Extension labels and output options | <a href="/intent-runtime/examples/en/output-options-example.json" download target="_blank" rel="noopener noreferrer">Download JSON</a> |

The scenarios cover: conditional withdrawal without premature removal; order ownership; all four constraint kinds and hierarchy; withdrawn IDs retained only in baseline; VIP maximum 20 versus non-VIP maximum 10; field invalidation and correction; withdrawn parameter requirements; facts without invented actions; explicitly supplied facts; unresolved and answered references; material-backed candidate choices; inference separated from confirmed target; complete intent with invalid fields; labels and output switches.

<span id="nativemcp-与-host-封装" aria-hidden="true"></span>

## Native, MCP, and host wrappers

- Native parse returns IntentResult on success and throws IntentError on technical failure.
- Executor MCP intent_runtime_parse puts the same IntentResult into structuredContent and JSON text content, with isError=false.
- Host prepare returns HostTask. The client generates candidateText; accept returns the final IntentResult. cancel returns handoff status. A candidate is not a final response.
- MCP technical failures have isError=true with text {error: SerializedIntentError}, without structuredContent or partialResult.
- SDK envelope fields depend on [negotiated protocol](/api/mcp#protocols-and-remote-calls); they are not added to Native IntentResult.

<a href="/intent-runtime/examples/en/executor-request.json" download target="_blank" rel="noopener noreferrer">Executor request</a> · <a href="/intent-runtime/examples/en/executor-result.json" download target="_blank" rel="noopener noreferrer">Complete executor reply</a>

For these host examples, config is standalone MCP configuration and request is prepare input. They use the same default output policy as their corresponding structural scenarios; no duration is a latency guarantee.

<a href="/intent-runtime/examples/en/order-request.json" download target="_blank" rel="noopener noreferrer">Host order configuration/request</a> · <a href="/intent-runtime/examples/en/order-result.json" download target="_blank" rel="noopener noreferrer">Host order result</a>

<a href="/intent-runtime/examples/en/clarification-request.json" download target="_blank" rel="noopener noreferrer">Host clarification configuration/request</a> · <a href="/intent-runtime/examples/en/clarification-result.json" download target="_blank" rel="noopener noreferrer">Host clarification result</a>

INTENT_RESULT_SCHEMA validates response shape, not natural-language correctness. The caller decides business actions; see [Read the result](/guide/results) and [Multi-turn](/guide/multi-turn).
