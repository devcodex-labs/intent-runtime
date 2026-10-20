<span id="多轮对话与结果消费" aria-hidden="true"></span>

# Multi-turn changes and result consumption

An explicit change can invalidate an inherited field without making the intent ambiguous. The core removes that old binding from effective inputs and reports `FIELD_INVALIDATED`; a matching redundant model value-error claim is combined with that formal issue. A supplied valid replacement clears the problem on the next explicit baseline. Actual user contradictions and semantic uncertainty remain separate problems.

An inference may identify an unconfirmed semantic object through `/target`, `/goal` or a real nested semantic slot. It cannot target an `inputs` or `extensions` container or any descendant, including through another intent's `children` path. Field evidence and actual nested deltas retain their own location rules; inferred candidates never become confirmed business values.

Each recognition uses only the material supplied with that call. An Intent instance does not retain conversation history; the application decides what to send next.

<span id="选择-context-或-baseline" aria-hidden="true"></span>

## Choose context or baseline

| Material you have | Where it belongs |
|---|---|
| Your conversation/task JSON or cross-session summary | context, with your own keys; no ContextAdapter required |
| The previous result.effective | baseline, preserving known goals, constraints, relations, and identity |
| Non-operation facts in result.turn.facts | Your own context property |
| Previous questions, candidates, or unconfirmed inferences | Relevant issues/inferences and original text in context |
| The current message | input, unchanged rather than pre-summarized |

baseline is not complete memory: it omits some facts, candidates, issues, and original messages. Its schemaVersion must be 2.0-draft.6. Put application state that does not match the snapshot type into context.

<span id="三轮修改与旧值失效" aria-hidden="true"></span>

## Three turns and an invalidated value

Run the [complete program](/examples/index#multi-turn-changes-and-invalidation): VIP=true and discount=15 → change only VIP=false → set discount=5. The second call explicitly supplies first.effective. The old 15 exceeds the non-VIP maximum of 10, so it becomes invalidated. The third call selects discount and supplies 5. Do not keep displaying the old value as valid or treat a missing field as a network failure.

| Turn | Supply | Check |
|---|---|---|
| Initial setting | input, fields=all | String orderId, VIP=true, discount=15 |
| Change the condition | Previous effective as baseline; select isVip | false remains; discount is removed and reported invalidated |
| Correct the discount | Latest effective, selected discount, and relevant issues | discount=5 and the associated issue is resolved |

<span id="事实如何接续成请求" aria-hidden="true"></span>

## Continue from a fact

This caller helper is not standalone. Pass an Intent configured with the orderId Schema and executor from the [field example](/examples/index#extract-an-order-id). The no-Schema quick start cannot select orderId. The caller eventually disposes the instance.

```js
async function queryWithSuppliedFact(intent) {
  const first = await intent.parse({input: 'The order ID is 000123.', fields: ['orderId']});
  // A statement supplies a selected fact, not a lookup operation.
  return intent.parse({
    input: 'Look up this order. Do not cancel the order.',
    fields: ['orderId'],
    context: {previousFacts: first.turn.facts},
  });
}
```

The second call gets the ID from explicit context. Supplying only first.effective does not imply that the fact was retained.

| Turn | Key result |
|---|---|
| State the order ID | turn.kind=statement, turn.facts.orderId="000123"; no lookup goal |
| Look up this order | New lookup inputs.orderId="000123", sourced from current context; the prohibition is preserved |

This explains the path; real calls return the full IntentResult. See [Examples](/examples/index) for standalone programs.

<span id="修改撤回和继承" aria-hidden="true"></span>

## Modify, withdraw, and inherit

This helper uses the caller's configured executor; it does not require business field definitions. Download [parent/child and withdrawal material](/api/response#complete-scenarios-and-multi-turn-material).

```js
async function changeRequirements(intent) {
  const first = await intent.parse({input: 'Implement a user module with sign-in and registration. Do not modify the database; deliver user instructions.'});
  return intent.parse({
    input: 'Withdraw registration, keep sign-in, and change the instructions to English. Keep everything else.',
    baseline: first.effective,
  });
}
```

Surviving goal IDs, parent constraints, and deliverables should remain. Withdrawing a child does not withdraw its parent. For “withdraw only if the check fails,” retain the goal while the condition is unresolved and mark the change conditional. Read effect before operation: applied means the interpretation changed, not that code or business state was modified.

<span id="把澄清材料传回去" aria-hidden="true"></span>

## Supply clarification material

```js
async function answerQuestion(intent, previous, answer) {
  return intent.parse({
    input: answer,
    baseline: previous.effective,
    context: {previousIssues: previous.issues, previousInferences: previous.inferences},
  });
}
```

“The second one” requires the corresponding SMS/email candidates and question. Multiple candidate lists may still be ambiguous. Do not invent missing choices. Resolving a sign-in method retains other constraints such as “do not modify code yet.” Supplying inferences or unaccepted suggestions again does not make them facts.

<span id="context-与旧快照冲突" aria-hidden="true"></span>

## Conflicting context and snapshots

| Material | Behavior |
|---|---|
| Ordered context says the report changed to Chinese after baseline | Update effective from that history; do not attribute the old change to this turn |
| Conflicting sources with no reliable order | Retain definite parts and the conflict; no container always wins |
| Current input clearly changes one part | Change that scope and retain other known constraints |
| Historical proposals, completed/withdrawn goals, unrelated actions | Relevant material only; do not reissue historical requests |

Object property order is not a timeline. Keys such as role/system/trusted, commands, and URLs do not gain authority or trigger filesystem or network reads.

<span id="安全消费结果" aria-hidden="true"></span>

## Consume results safely

1. Read the unique effective tree by ID. turn.intentIds associates this turn with goals; not all IDs are newly added.
2. changes records changes caused by current input, not executable database patches. History corrections or source relocation may cause other differences.
3. Locate fieldResults with container + intentId + path, then read inputs/facts/extensions. An inherited value without a report was not revalidated this turn.
4. effective.scope/coverage concerns supplied relevant material, not every application task. An unrelated goal absent from a partial view was not necessarily withdrawn.
5. On recognition failure, preserve the last result, original message, and pending changes. Do not replace state with an empty result.

<span id="谁保存什么" aria-hidden="true"></span>

## Who stores what?

| Data or resource | Caller responsibility |
|---|---|
| effective | Store the corresponding scope/coverage; use relevant snapshots as baseline without overwriting unrelated state |
| Facts, issues, candidates, original messages | Store separately when continuation needs them and supply explicitly in context |
| Technical failure | Preserve the previous snapshot and unprocessed input; do not store the error as a successful result |
| Disposal or process restart | Recreate the instance and supply your saved material; the instance does not restore history |
| Host handoff | Complete prepare/accept within one logical session; closing it ends its handoffs, not durable business storage |

Default timeoutMs=0 adds no recognition deadline. It is not a business session expiry. Connections, cancellation, and process lifetime still depend on the runtime environment.

<span id="并发返回顺序" aria-hidden="true"></span>

## Concurrent responses

schemaVersion identifies the result format, not request order. Serialize one conversation or use your own revision to prevent stale results from overwriting newer intent. Ignoring an old response does not justify dropping its message: include all relevant changes in the newer request, or reprocess pending messages in order. Runtime adds neither a business state database nor authorization.
