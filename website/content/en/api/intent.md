# Native API

The root exports Intent, IntentError, readonly INTENT_RESULT_SCHEMA, and public types. Model API and MCP adapters have separate exports; see [Integrations](/integrations/index).

| Look up | Reference | Failure form |
|---|---|---|
| Initialization and trusted configuration | [Intent](#intent), [Configuration](/guide/configuration) | Synchronous construction error |
| Input, context, baseline, fields, cancellation | [parse parameters](#parse-parameters) | Promise rejection; normal issues do not reject |
| Shutdown and subsequent calls | [Intent](#intent) | Idempotent disposal; parsing after disposal rejects |
| Error serialization | [IntentError](#intenterror) | Safe summary by default; optional existing partialResult |
| Your own model | [ModelExecutor](#modelexecutor) | Candidate generation, not the final result |

## Intent

```ts
class Intent {
  constructor(config: IntentConfig);
  parse(request: IntentParseRequest, options?: IntentParseOptions): Promise<IntentResult>;
  dispose(): Promise<void>;
}
```

Construction validates and snapshots configuration, throwing IntentError synchronously if invalid. parse returns a Promise that resolves to a result or rejects on technical failure. dispose is idempotent, ends owned recognition, and releases owned resources without closing shared executors or indefinitely waiting for uncooperative external Promises. Parsing after disposal produces INSTANCE_DISPOSED.

<span id="parse参数" aria-hidden="true"></span>

### parse parameters

| Path | Type / required | Default | Behavior |
|---|---|---|---|
| request.input | nonblank string / yes | none | Original user input, retained unchanged |
| request.fields | string[] or 'all' / no | [] | Top-level business fields; deduplicated in first-occurrence order; unknown names produce FIELD_UNKNOWN |
| request.context | object / no | none | JSON root object with your own internal keys |
| request.baseline | EffectiveIntentSnapshot / no | none | Previous effective; invalid version/structure produces INPUT_INVALID |
| request.referenceTime | string / no | none | ISO date-time with a timezone; no implicit local clock |
| request.output | IntentOutputOptions / no | instance defaults | Per-key overrides; {} does not clear defaults |
| options.signal | AbortSignal / no | none | Cancels this recognition only; not included in JSON |

Supplied material is not mutated. Repeated parse calls do not inherit history implicitly. Root arrays/null/class instances are invalid context; functions, cycles, accessors, undefined, and nonfinite numbers are not JSON. Standard parameters reject unknown keys, without restricting business keys inside context. Nonempty fields or all without schema produce SCHEMA_NOT_CONFIGURED; enabling extensions without its definition also fails.

Start with [Read the result](/guide/results), then [IntentResult](/api/response). See [Configuration](/guide/configuration) and [Multi-turn material](/guide/multi-turn).

## IntentError

```ts
class IntentError extends Error {
  constructor(code: IntentErrorCode, options?: IntentErrorOptions);
  readonly code: IntentErrorCode;
  readonly stage: IntentErrorStage;
  readonly details?: IntentErrorDetails;
  readonly partialResult?: IntentResult;
  readonly cause?: unknown;
  toJSON(): SerializedIntentError;
  serialize(options?: ErrorSerializationOptions): SerializedIntentError;
}
```

code selects a generic English message; unknown codes throw TypeError. Options can specify stage/details/cause. toJSON equals default serialize. serialize({includePartialResult:true}) includes a partialResult only if it exists. cause is non-enumerable and excluded from the standard summary.

Not every error has a partialResult. It may contain original material and is not an ordinary successful result. MCP technical errors omit partialResult. diagnostics does not authorize logging every raw error. See [Errors and recovery](/api/errors).

## INTENT_RESULT_SCHEMA

Readonly Draft-07 JSON Schema for the successful result version, including local definitions and references. It validates Result structure; it is not a business-field Schema, candidate Schema, formatter, or model-quality guarantee. Deep-copy before passing it to an SDK that modifies Schemas.

## ModelExecutor

```ts
interface ModelExecutor {
  readonly id: string;
  generate(request: ModelRequest): Promise<ModelReply>;
}
type ModelRequest = {
  instructions: string;
  input: JsonObject;
  outputSchema: object;
  signal: AbortSignal;
};
type ModelReply =
  | {outcome: 'complete'; text: string}
  | {outcome: 'refusal' | 'incomplete'; reason?: string};
```

Intent captures id and generate at construction; the caller still owns shared connections. generate calls a real model to produce one candidate text matching outputSchema, not a final IntentResult. Honor signal and do not add absent history or business tools. Native generates once per recognition, without implicit retries, model switching, or output-format fallback.

See [Model APIs](/integrations/api) for configuration and a complete custom executor, and [Types](/api/types) for nested declarations.
