# Errors and partial results

IntentParseError extends Error and has code, stage, message, issues and optional partialResult. toJSON() returns the stable transport contract without SDK objects, stack traces or credentials. IntentDataError is the DATA_EXTRACTION_FAILED subtype.

Stages: config, input, core, data, bridge. Technical diagnostics use English; model business explanations use configured language.

| Code group | Meaning |
|---|---|
| CONFIG_INVALID / SCHEMA_UNSUPPORTED | Invalid configuration or unsupported definition |
| INPUT_INVALID / UNKNOWN_FIELD | Malformed request or undefined selection |
| LIMIT_EXCEEDED | Explicit size, depth, count, capacity or concurrency limit |
| EXECUTOR_NOT_CONFIGURED / INSTANCE_DISPOSED | Missing model driver or closed instance |
| MODEL_AUTH_FAILED / MODEL_RATE_LIMITED / MODEL_REQUEST_FAILED | Authentication, limit or transport/provider failure |
| MODEL_TIMEOUT / MODEL_ABORTED | Deadline or explicit cancellation |
| MODEL_REFUSED / MODEL_OUTPUT_INCOMPLETE | Refusal or unfinished provider/host generation |
| MODEL_OUTPUT_INVALID | Invalid candidate after bounded repair |
| DATA_EXTRACTION_FAILED | Actual extension information/definition cannot be satisfied |
| HOST_CAPABILITY_UNSUPPORTED | Required model capability not configured |
| BRIDGE_JOB_NOT_FOUND / BRIDGE_JOB_EXPIRED / BRIDGE_STEP_CONFLICT | Connection/job/token lifetime errors |

Data issue codes: DATA_REQUIRED_MISSING, DATA_AMBIGUOUS, DATA_CONFLICT, DATA_CARDINALITY_MISMATCH, DATA_VALUE_UNREPRESENTABLE, DATA_CONSTRAINT_VIOLATED, DATA_DEPENDENCY_MISSING, DATA_DESCRIPTION_UNDETERMINED; DATA_SOURCE_INVALID is reserved for program diagnostics and cannot be invented by model candidates.

A core failure has no fabricated partialResult. After core passes, a data failure carries partialResult with data: {}. These default fields have passed structural checks, not a proof of perfect semantic understanding. Handle the error and issues together; do not silently consume partialResult as complete extension success.

A malformed candidate with omitted required information but no genuine business finding is repairable. A model business-missing finding remains semantic and needs evaluation against source materials.
