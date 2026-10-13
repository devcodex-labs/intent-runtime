# 完整响应结构

```ts
type IntentResult = {
  schemaVersion: '2.0-draft.6'; input: string; status: 'complete' | 'partial';
  turn: {kind: TurnKind; normalizedInput: string; intentIds: string[]; changes: IntentChange[]; facts: JsonObject};
  effective: {schemaVersion: '2.0-draft.6'; coverage: 'complete' | 'partial' | 'unavailable'; scope: 'current_request' | 'provided_materials'; intents: StructuredIntent[]; constraints: IntentConstraint[]; relations: IntentRelation[]; unresolved: string[]};
  fieldResults: FieldResult[]; issues: IntentIssue[]; inferences: IntentInference[];
  suggestions?: IntentSuggestion[]; evidence?: SourceEvidence[]; diagnostics?: IntentDiagnostics;
};
```

完整意图只在 effective.intents，包括 children。没有根级 data、requirements 副本或 turn.intents。每个 StructuredIntent 必返 id、domain/action/target（可 null）、goal、understanding、constraints、inputs、references、children、extensions；optional、expectedOutput 按材料省略或返回。understanding 为 clear/incomplete/ambiguous/conflicted。

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
| unresolved | 未解决的语义 issue ID 数组；候选和问题存于对应 issues |
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
