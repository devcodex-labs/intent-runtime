# Usage contract

Construct new Intent({ language?, schema?, executor?, timeoutMs?, repairAttempts?, limits? }).

parse accepts exactly one plain request object: { input, fields?, context? }. Old positional signatures and unknown properties fail before model generation.

## Result

The root fields are input, normalizedInput, primaryIntent, requirements, intents, prohibitions and data. input copies the received string exactly. Other default explanations use the configured language. IDs are i1, i2 etc., unique within one result.

Actions: query, analyze, generate, modify, delete, execute, other; unknown action is null and requires clarification. Status priority is needs_clarification → awaiting_confirmation → conditional → ready. All unresolved blockers are retained in reason; all business prerequisites must remain in requirements. ready omits reason/clarification; needs_clarification carries at least one question.

Explicit ordering is preserved; array position without ordering is presentation only. Conditions and exclusive branches are readable requirements, not an execution graph.

## Schema and selection

Only object roots with selectable properties are accepted. Omitted Schema or {} means no extension. Missing $schema means Draft-7; explicit unsupported dialects, refs, root combinators or enum/const, conditionals/dependencies and runtime functions fail at configuration. Root value constraints cannot be projected without changing their meaning.

Supported native constraints: primitive types/null, enum/const, object/properties/required/additionalProperties, homogeneous arrays, lengths, pattern, supported format, numeric bounds/multipleOf, item lengths/uniqueness and bounded nested anyOf/oneOf/allOf/not. Unsupported keywords are rejected. Nested required remains intact. Root required must refer to declared properties.

Supported format baseline: date, time, date-time, duration, uri, uri-reference, url, email, hostname, ipv4, ipv6, regex, uuid, json-pointer, relative-json-pointer. Explicit definitions are compiled against the pinned native validator.

Field names are literal top-level names. A declared a.b field can be selected as a.b; a nested a.b path is not invented. Repeated selections deduplicate. Unselected required does not invalidate a projection. Root output forbids unselected fields; nested extra-property behavior follows the native definition.

Optional without evidence is omitted. Missing required is reported. null is not shorthand for unknown; it requires definition permission and explicit empty-value evidence. No defaults, coercion or silent extra-field removal.

## Evidence and failure

Internal data candidates include data, evidence, descriptionChecks, fieldResults and issues. Those fields support checking and repair, and do not enter the public result. Every selected field has a conclusion; every returned leaf or empty container has source evidence. Exact string values equal their quoted source; semantic mapping still requires review.

Description checks cover returned declared and dynamic additionalProperties values, array items and allOf branches. Only matching anyOf/oneOf branches contribute descriptions. JSON Pointer names escape `/` and `~`; absent optional values do not need checks. Multiple applicable descriptions at the same path require a verdict covering all of them.

Candidate mistakes are repaired at most once per stage by default. Actual business missing/conflict/capacity/description failures terminate without guessing. All data failures retain the checked default result; no partially checked business fields are committed.

## Lifetime

parse requires an executor and defaults to one 120-second deadline across both stages and repairs. Four concurrent API parses per instance by default; there is no waiting queue. dispose is idempotent, aborts active requests/jobs and rejects new calls, while leaving a borrowed executor alive.

Native business validation runs in an instance-owned worker pool with at most two live threads, including threads being terminated. limits.maxValidationMs defaults to 1000 ms and includes queue time, worker startup, native compilation/validation and description-branch matching. limits.maxValidationQueueEntries defaults to 32 and counts running and waiting validations. Exhaustion or validation timeout returns LIMIT_EXCEEDED, retains the checked core and commits no business fields. Cancelling/disposal interrupts workers; idle workers are reclaimed. These computation budgets apply when submitting a candidate and do not expire an idle bridge session.

Core/data tasks use independent explicit materials. No hidden model history, external tools, file reading or implicit credentials. The Codex bridge does not physically erase the host model's broader context.

## Bridge

createIntentBridge({ instances: { name: intent }, ...limits }) returns connect()/close(). Each connect() creates an isolated session with prepare({instance,input,fields?,context?}), accept({jobId,stepToken,candidateText}), cancel({jobId,outcome?,detail?}) and close().

Call and await session.accept: it returns Promise<BridgeReply>. Same token and identical candidate text replays the prior reply while retained; concurrent identical submissions share the same operation. Changed candidates conflict. Each stage/repair rotates tokens. Jobs are connection-bound and have no default time expiration, including multi-day pauses. Completed records are reclaimed by capacity, not by a default timer. Optional jobTtlMs enables an idle lifetime, renewed after a successful stage/repair; replayTtlMs enables a completed-reply lifetime. Omitted or zero disables each timer, and task replies omit expiresAt unless expiration is enabled. Default active cap is 32; retained jobs cap 128 (including active jobs), retained materials/replay cap 8 MiB. Completed records are evicted first. An over-budget submission returns LIMIT_EXCEEDED and preserves the active stage and token for retry after freeing capacity or reducing the candidate. Closing a connection, cancelling, or disposing an instance ends its jobs. Process restart/connection recovery is not persisted.

Closing a bridge does not dispose borrowed Intent instances. The command entry owns configuration-created instances and disposes them on exit.
