<span id="错误与失败恢复" aria-hidden="true"></span>

# Errors and recovery

Technical failures throw IntentError rather than returning truncated candidates or infrastructure failures as normal success. Field issues remain in a normal result's issues.

If there is no result, check for an exception. If the result lacks an order ID, inspect fieldResults and issues first. Timeout, authentication failure, and missing user information need different recovery actions. If Codex cannot start or has no tools, begin with [registration diagnostics](/operations/codex).

| Example | Observable result | Action |
|---|---|---|
| Select orderId without schema | Rejected Promise, SCHEMA_NOT_CONFIGURED | Configure a Schema and recreate the instance, or omit field selection |
| Required ID missing from user input | Normal IntentResult with field/issue reports | Ask the user; do not treat missing business data as network failure |
| Change only VIP=false; previous discount=15 violates its new rule | Normal result, discount invalidated | Do not consume the old value; select discount and supply a valid value next turn |

Recovery is **identify code/issue → repair input/configuration → make an explicit new call → inspect the new result**. It is not automatic retry. See [MCP envelopes](/api/mcp#success-and-error-envelopes).

| Technical code | Meaning |
|---|---|
| INPUT_INVALID / CONFIG_INVALID / FIELD_UNKNOWN | Invalid request, trusted configuration, or selected field |
| SCHEMA_INVALID / SCHEMA_NOT_CONFIGURED / SCHEMA_UNSUPPORTED_FOR_EXTRACTION | Invalid, absent, or unsupported definition |
| EXECUTOR_NOT_CONFIGURED | Native/executor mode has no executor |
| MODEL_AUTH_FAILED / MODEL_RATE_LIMITED / MODEL_REQUEST_FAILED | Authentication, rate limit, or request failure |
| MODEL_REFUSED / MODEL_OUTPUT_INCOMPLETE / MODEL_OUTPUT_INVALID | Refusal, truncation, or invalid candidate structure/sources/invariants |
| MODEL_TIMEOUT / REQUEST_ABORTED / INSTANCE_DISPOSED | Explicit deadline, cancellation, or disposal |
| RESOURCE_LIMIT | Capacity/work exceeded; details includes limit/allowed/observed/unit |
| INTERNAL_PROCESSING_FAILED | Local infrastructure or final output failure, stage=validation/output |
| HOST_REQUEST_NOT_FOUND / HOST_SUBMISSION_CONFLICT | Missing handoff record, conflicting token, or different candidate |

Semantic issue codes include AMBIGUOUS_REFERENCE, INTENT_INFORMATION_MISSING, CONSTRAINT_CONFLICT, RELATION_CONFLICT, CONTEXT_CONFLICT, CONTEXT_INCOMPLETE, UNCONFIRMED_INFERENCE. Field codes include FIELD_REQUIRED_MISSING, FIELD_APPLICABILITY_UNKNOWN, FIELD_CARDINALITY_MISMATCH, FIELD_VALUE_INVALID, FIELD_DEPENDENCY_MISSING, FIELD_VALIDATION_UNDETERMINED, FIELD_INVALIDATED.

<span id="按发生位置恢复" aria-hidden="true"></span>

## Recover at the right layer

Ambiguity, missing fields, and invalid values are usually normal interpretation issues, not transport failures.

| Symptom or code | Inspect | Caller action |
|---|---|---|
| SCHEMA_NOT_CONFIGURED | fields/extensions and matching definition | Recreate with correct configuration; use fields=[] when extraction is unnecessary |
| FIELD_UNKNOWN / SCHEMA_INVALID / CONFIG_INVALID | Field names, supported rules, model/configuration | Correct input/configuration; repetition does not repair it |
| FIELD_REQUIRED_MISSING / FIELD_DEPENDENCY_MISSING | Missing values or condition evidence | Ask the user and supply context/baseline/selected fields |
| FIELD_VALUE_INVALID / FIELD_INVALIDATED | Illegal candidate or outdated inherited value | Do not consume it; obtain a valid explicit replacement |
| FIELD_VALIDATION_UNDETERMINED | Proof capability and rule support | Preserve unknown and inspect Schema support; extra input may not help; no invented defaults or blind retry |
| Normal issues such as AMBIGUOUS_REFERENCE | Reference and candidate material | Ask the questions and return the corresponding issue/candidates |
| MODEL_OUTPUT_INVALID | Safe details.violations paths/rules | Native caller decides whether to recognize again; host may submit correction from explicit feedback without resetting the same validation budget |
| MODEL_AUTH_FAILED / MODEL_RATE_LIMITED / MODEL_REQUEST_FAILED | Credentials, permission, quota, provider status, network | Repair authentication or wait for recovery; caller chooses retry policy |
| MODEL_REFUSED / MODEL_OUTPUT_INCOMPLETE | Refusal or unfinished generation | Do not parse truncated text; explicitly retry only after appropriate input/limit changes |
| RESOURCE_LIMIT | details.limit/allowed/observed/unit | Reduce relevant material or adjust trusted limits; maxValidationChecks exhaustion ends this recognition |
| HOST_REQUEST_NOT_FOUND | Closed session, restart, reclaimed terminal record | Prepare again with complete material and use new requestId/token |
| HOST_SUBMISSION_CONFLICT | Mixed identities/tokens or different candidates | Keep the original handoff identity; prepare a new request instead of overwriting another submission |
| REQUEST_ABORTED / MODEL_TIMEOUT | Caller signal or explicit timeoutMs | Preserve previous state; a new recognition is explicit; default timeoutMs=0 adds no deadline |
| INSTANCE_DISPOSED / INTERNAL_PROCESSING_FAILED | Instance lifetime, code/stage, deployment version | Recreate disposed instances; retain a safe failure summary; do not treat partialResult as success |

Runtime does not perform these recovery actions for you. Host format correction is based on explicit feedback; missing knowledge, unknown fields, and business authorization are separate.

```js
import {IntentError} from '@devcodex/intent-runtime';

async function parseWithErrorSummary(intent, request, signal) {
  try {return await intent.parse(request, {signal});}
  catch (error) {
    if (error instanceof IntentError) console.error(error.toJSON());
    throw error;
  }
}
```

Serialization includes name/code/message/stage and safe details; cause is non-enumerable. Standard technical messages are generic English without original input or keys. MCP technical failures return isError=true and text {error:...}, with no structuredContent or partialResult.

Preserve prior results and original messages. Failure does not clear application state. The caller decides technical retry and handles out-of-order requests with its own revision. Unknown fields do not trigger automatic fact generation.

This is a caller helper, not an SDK method; the caller owns Intent lifetime. PROCESSING_INCOMPLETE appears only in an established technical failure's partialResult; truncated text is not a normal result. toJSON omits partialResult by default, since complete results can contain original material. Use serialize options explicitly when needed; see [IntentError](/api/intent#intenterror).
