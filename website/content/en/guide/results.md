<span id="如何读取结果" aria-hidden="true"></span>

# Read the result

For “Look up order 000123. Do not cancel the order,” start with the goal and prohibition. A structured string ID is extracted only when you configure a Schema and select orderId.

This is a **reading summary**, not a reduced API response. Real results retain every required field; see the [complete response](/api/response).

| Your question | Read | Meaning in this example |
|---|---|---|
| What does the user want? | goal in effective.intents and children | Look up order 000123 |
| What constraints apply? | effective.constraints and each intent's constraints | Do not cancel; account for global and parent scope |
| Which parameters were extracted? | inputs on the owning intent | String "000123" when orderId is selected |
| Can a parameter be used? | fieldResults | Match container, intentId, and path |
| What should I ask? | issues.message, questions, candidates | Resolve the specific issue; do not choose a candidate yourself |
| What is inferred? | inferences | Review the target, sources, and optional candidate separately from confirmed facts |
| What changed this turn? | turn.kind, intentIds, changes | Changes are interpretation records, not business execution commands |

<span id="先读目标再决定是否使用参数" aria-hidden="true"></span>

## Goals before parameters

Check effective goals and global/local constraints, then issues. Read fields by ownership only when you need business parameters. Distinguish a thrown technical error from a normal result with no operation intent; see [Errors](/api/errors).

<span id="按归属读取字段" aria-hidden="true"></span>

## Read fields by ownership

This application helper is not an additional SDK method. It returns definite fields checked in this turn. Inherited values without a current report require separate business handling.

```js
function readOrderIds(result) {
  const nodes = new Map();
  function visit(items) {
    for (const node of items) {nodes.set(node.id, node); visit(node.children);}
  }
  visit(result.effective.intents);
  return result.fieldResults
    .filter(field => field.container === 'inputs' && field.path === '/orderId' && field.status === 'present')
    .map(field => ({intentId: field.intentId, orderId: nodes.get(field.intentId)?.inputs.orderId}));
}
```

Use intentId for multiple orders; do not attach every ID to the first goal. Valid false, 0, and empty strings are not missing. explicit_null means an explicit null allowed by the Schema. unknown, invalid, and invalidated do not provide a definite usable value; see [Field states](/api/response#states-and-consumption).

<span id="事实歧义和失败" aria-hidden="true"></span>

## Facts, ambiguity, and failures

- “The order ID is 000123” is a statement. When orderId is selected, the value belongs to turn.facts; fieldResults has container=facts and intentId=null. No lookup is created.
- “Process this order” without identifying material requires clarification through issues. Supply relevant context explicitly on the next call; history is not searched.
- status=complete measures intent understanding. It does not guarantee complete or valid fields, authorization, or execution. partial may contain definite usable parts.
- Technical failures use IntentError or an MCP error envelope. Preserve the prior result and original message, then follow [recovery guidance](/api/errors).

<span id="根据结果决定下一步" aria-hidden="true"></span>

## Decide the next step

| Observation | Action | Do not assume |
|---|---|---|
| complete; required fields present/explicit_null this turn | Read definite values by ownership and apply business requirements | Authorized or executed |
| complete; a field invalid/invalidated | Do not use it; correct or clarify the related issue, then recognize again | Every parameter is usable because the root is complete |
| partial; unresolved reference or ambiguity | Show definite parts and ask the questions | Pick a candidate or discard unrelated explicit constraints |
| No intents, but turn.facts exists | Save/show selected facts and supply them explicitly later | A fact creates a query or update |
| inferences exists | Keep candidates separate from confirmed information | An inference is a default or commitment |
| Exception or MCP isError=true | Recover by code; retain previous state | An empty successful result or automatic retry |
| Modification or withdrawal | Inspect effect and scope/coverage; update the corresponding snapshot | changes is an executable business patch |

Missing user information and broken configuration require different actions. Ask for an absent order ID; fix the instance when orderId is selected without a Schema. See the [complete scenarios](/api/response#complete-scenarios-and-multi-turn-material).

<span id="接下一轮" aria-hidden="true"></span>

## Continue the conversation

Use this effective snapshot as baseline to preserve goals and identity. Supply facts, issues, and candidates separately in context as needed. Your application owns storage, ordering, authorization, and actions; see [Multi-turn changes](/guide/multi-turn).
