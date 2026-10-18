# Documentation translation contract

English is the default site language; Chinese lives under `/zh/`. Both document the same current V2 API. Site locale does not change an application's Intent configuration. `language` controls explanatory model output; it does not translate protocol keys or configured action IDs.

| English | Chinese | Required meaning |
|---|---|---|
| goal | 目标 | What the user wants; no execution or authorization is implied. |
| constraint | 约束 | Includes requirement, prohibition, precondition and preference. |
| effective snapshot | 有效意图快照 | The current goal tree for the supplied scope, not all conversation history. |
| baseline | 前次有效快照 | A previous effective snapshot supplied explicitly by the caller. |
| host mode | 宿主模型模式 | The client model generates the candidate; different from an HTTP bind host. |
| candidate | 候选 | Model-generated candidate JSON text; not a final IntentResult. |
| complete | 理解完整 | Does not guarantee valid fields, authorization or completed business actions. |
| unknown | 待确定 | Different from not_provided, absence or nonexistence. |
| invalidated | 旧值失效 | A previous value became invalid after a change; distinct from invalid. |
| removed | 已撤回 | The field requirement was withdrawn; not a database deletion. |

Preserve: `fields=[]` still recognizes intent and does not clear every inherited value; no Schema does not enable business extraction; `evidence=false` retains necessary issue/inference sources; no implicit history, automatic retry or fallback; visible tools do not prove prepare/accept completed. Keep JSON keys, public type names, state codes, configured action IDs and schemaVersion unchanged. Generate complete localized results through the same core and validator; never hand-edit them to resemble a translation.
