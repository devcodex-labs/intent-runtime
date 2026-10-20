<span id="配置参考" aria-hidden="true"></span>

# Configuration reference

Start with the [quick start](/guide/quick-start). Use this reference when choosing output options, rules, capacity, or cancellation behavior. See [Schema support](/api/schema) for the complete rule matrix.

new Intent(config) validates and snapshots configuration. Create a new instance when changing rules; mutating the original object does not update an existing instance. The executor retains caller-owned service connections; the library does not close shared services.

<span id="按任务查配置" aria-hidden="true"></span>

## Find configuration by task

| Task | Configure | Guide |
|---|---|---|
| Recognize goals and constraints | executor, optionally language | [Quick start](/guide/quick-start) |
| Extract an order ID | schema and request fields | [Field example](/examples/index#extract-an-order-id) |
| Supply previous material | Request context/baseline, not a new instance session setting | [Multi-turn](/guide/multi-turn) |
| Reuse the current Codex model | host configuration, no executor | [Codex](/integrations/codex) |
| Detailed evidence, suggestions, or semantic labels | defaultOutput/output; labels also require extensionSchema | [Output options](#output-options) |

Default limits and timeoutMs are suitable starting points. They are not mandatory onboarding settings or substitutes for client connection configuration.

## IntentConfig

| Path | Type / required | Default | Purpose and rules |
|---|---|---|---|
| language | string / no | en | BCP 47 tag for explanatory text; does not translate code, IDs, or configured action identifiers |
| executor | ModelExecutor / Native and executor mode | none | Explicit model source; host mode does not call it; no default provider |
| schema | IntentSchema / when selecting business fields | none | schema-dsl@3.0.4 Builder or [supported JSON Schema](/guide/fields) |
| extensionSchema | IntentSchema / no | none | Additional semantic labels; top-level names must not overlap business fields |
| semantics | BusinessSemantics / no | none | Domain, terms, actions, examples and counterexamples; not an executable capability list |
| timeoutMs | nonnegative safe integer / no | 0 | 0 adds no deadline; positive values cover generation, validation, and host waiting; maximum 2147483647 ms |
| defaultOutput | IntentOutputOptions / no | all false | Request output overrides individual keys rather than replacing the whole object |
| limits | Partial&lt;IntentLimits&gt; / no | below | Positive safe-integer capacity/work limits; MCP arguments cannot change them |

Configuration and standard request parameters reject unknown keys; context uses your own internal keys. Optional top-level Native properties set to undefined count as omitted; undefined inside context is not JSON. Invalid configuration usually throws at construction; see [Errors](/api/errors).

## semantics

Rows are relative to semantics. For example, terms[].name means semantics.terms[].name.

| Path | Type / required | Rule |
|---|---|---|
| domain | string / no | Domain name |
| description | string / no | Business description |
| terms | array / no | Nonempty name and meaning; optional aliases string array |
| actions | array / no | Nonempty name and meaning; optional examples/counterExamples string arrays |

| Full nested path | Type / required | Default | Purpose |
|---|---|---|---|
| semantics.terms[].name | nonempty string / yes | none | Term name |
| semantics.terms[].meaning | nonempty string / yes | none | Business meaning |
| semantics.terms[].aliases | string[] / no | omitted | Aliases; do not add user facts |
| semantics.actions[].name | nonempty string / yes | none | Action identifier retained on an explicit match |
| semantics.actions[].meaning | nonempty string / yes | none | Action meaning |
| semantics.actions[].examples | string[] / no | omitted | Positive examples |
| semantics.actions[].counterExamples | string[] / no | omitted | Counterexamples distinguish easily confused actions |

Conflicting meanings for the same name produce CONFIG_INVALID. Explicitly matched domain/action names remain as configured regardless of output language. Definitions guide understanding; they do not remove unsupported requests or turn examples into user facts.

<span id="输出选项" aria-hidden="true"></span>

## Output options

Rows are relative to defaultOutput or request output, for example defaultOutput.evidence and request.output.evidence. Unspecified keys inherit instance defaults.

| Path | Type / default | Enabled | Disabled |
|---|---|---|---|
| suggestions | boolean / false | Clarification/improvement suggestions, [] when none | No additional suggestions section |
| evidence | boolean / false | Detailed sources, [] when none | Necessary sources, issues, and inferences remain |
| diagnostics | boolean / false | durationMs/modelCallCount | No diagnostics section |
| extensions | boolean / false | Extract all top-level extensionSchema labels | No new labels; old extension invalidation still applies |

defaultOutput:{evidence:true} plus output:{} keeps evidence enabled; output:{evidence:false} disables it explicitly. Enabling extensions without extensionSchema produces SCHEMA_NOT_CONFIGURED. Extensions cannot bypass fields to extract operation parameters.

## limits

Rows are relative to limits, for example limits.maxValidationChecks. Omitted properties use their respective defaults.

| Path | Default | Measured scope |
|---|---:|---|
| maxInputBytes | 65536 | UTF-8 bytes of original input |
| maxContextBytes | 1048576 | Context JSON |
| maxBaselineBytes | 1048576 | baseline JSON |
| maxSchemaBytes | 262144 | Each business/extension Schema |
| maxRequestBytes | 3145728 | Static material plus the entire logical request, not only separate component checks |
| maxOutputBytes | 1048576 | Canonical candidate text, HostTask, and final result checked separately |
| maxDepth | 64 | JSON root container at depth 0 |
| maxConcurrentParses | 8 | Active Native/host recognition and unfinished underlying calls per Intent |
| maxValidationChecks | 256 | Business validation calls per recognition; host correction does not reset the budget |

Exceeding a limit produces RESOURCE_LIMIT without silent truncation. A budget is not session expiry. Cancellation may return before an uncooperative executor ends; its slot remains occupied until it actually settles. The library cannot guarantee termination of arbitrary caller code or a model-cost refund.

For OpenAI strict output, maxResponseBytes bounds the visible HTTP envelope before decoding. The adapter also bounds wire JSON depth from its compiled Schema and rejects duplicate keys before normalization. Generation variants are checked against provider size/depth limits after refinement. Core maxOutputBytes/maxDepth apply to the canonical candidate returned by the adapter, and then to the final result; whitespace and registered quote:null omissions on the wire are not the canonical candidate byte count. Current-input sources use a whole-input pointer without a local quotation. These are separate checks, without silent truncation or reply repair.

<span id="其他公开配置" aria-hidden="true"></span>

## Other public configuration

- [Model API](/integrations/api): ApiExecutorConfig, URLs, formats, response-body limits.
- [MCP](/integrations/mcp): adapter/service configuration, instances, prefixes, protocols.
- [Codex](/integrations/codex) and [maintenance](/operations/codex): trusted files, environment paths, CLI options and exit codes.

See [TypeScript types](/api/types) for complete declarations.
