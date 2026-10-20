<span id="兼容与支持" aria-hidden="true"></span>

# Compatibility and support

Diagnostic regressions must cover both agreement and contradiction with formal proofs, distinct owners and nested paths, multiple semantic problems, and issue/clarification/suggestion references after coalescing. Inference checks must reject business containers and nested-child bypasses while retaining legitimate semantic inference, field evidence and deltas. Controlled fixtures, actual client calls and new provider requests provide separate evidence; a Schema-valid reply alone does not establish semantic correctness.

This documentation describes **Intent Runtime V2**. See [Installation](/guide/installation) for setup. Result and baseline schemaVersion is `2.0-draft.6`, a format identifier independent of the npm package version.

<span id="运行环境" aria-hidden="true"></span>

## Runtime

| Item | Supported scope |
|---|---|
| Node.js | ≥20.0.0, ESM |
| Platforms | Windows, macOS, Linux; cross-platform regression on Node 20.0.0/24.x |
| schema-dsl | Integrated at 3.0.4; see the [rule matrix](/api/schema) |
| CommonJS / browsers | Not promised as direct runtime entry points for this release |

<span id="接入状态" aria-hidden="true"></span>

## Integration boundaries

| Entry | Status and scope |
|---|---|
| Native, stdio, SDK-independent adapter | Direct application calls, standalone stdio, embedded MCP; shared recognition core |
| MCP protocols | SDK verification for 2025-06-18, 2025-11-25, 2026-07-28 |
| Current Codex CLI model | Host mode reuses the model; an actual Linux/CLI 0.162.1/gpt-6.1-sol integration record negotiated 2025-06-18 |
| Codex Desktop | Configuration provided; actual client not independently verified |
| Model APIs | OpenAI/xAI Responses and explicit Chat Completions; automated protocol/reply/error tests; actual provider configuration needs its own verification |
| JavaScript / TypeScript | ESM applications supported; CLI loads .js/.mjs, with TypeScript configuration compiled first |
| Streamable HTTP | Standalone CLI address/port/path/public-origin; stateful 2025 protocols have SDK/session-isolation checks and public HTTPS Host/Origin rejection regression; embedded adapter also available; arbitrary remote auth/proxy deployments are not thereby verified |
| Other clients | Core is composable; no dedicated setup adapter or client compatibility guarantee |

Separate supported targets from tested versions. Recheck your real model, client, SDK, and deployment after changes. Structural checks do not guarantee correct understanding of every natural-language input. A particular corpus pass rate is not a product-wide accuracy claim.

The built-in OpenAI json_schema path uses strict output in both protocols. Strict Schema acceptance verifies the wire format, while complete recognition also requires valid source pointers, node ownership, declared fields, and semantic consistency. A model can pass the former and fail the latter; do not treat a successful HTTP response or a structurally valid reply as a completed recognition.

<span id="验证记录与范围" aria-hidden="true"></span>

## Dated verification records

See the current [CI workflow](https://github.com/devcodex-labs/intent-runtime/actions/workflows/ci.yml). These dated records do not prove every later commit or your model configuration.

| Date | Environment/method | Evidence and boundary |
|---|---|---|
| 2026-10-19 | Local V2 candidate with v1.2 adapter refinements; Node 24.17.0 | Linux regression 374/374 and actual Windows Codex CLI 0.145.0 prepare/accept passed. Both OpenAI models/protocols accepted the strict schema. gpt-4.1-mini passed each five-case sequence and its two-step repeat; gpt-5-mini still produced field/conflict or unconfirmed-inference diagnostics on the non-VIP change. The provider matrix remains unaccepted; this is not a release-readiness claim |
| 2026-10-19 | Earlier v1.1 candidate; Windows, Node 24.17.0, Codex CLI 0.145.0 | Actual host prepare/accept preserved orderId=000123 and the cancellation prohibition. Both OpenAI models/protocols accepted strict schemas, but that candidate's five-case semantic matrix did not pass |
| 2026-10-15 | 71c774d; Linux/Windows/macOS × Node 20.0.0/24.x; quality/docs, 8 jobs | [Exact CI](https://github.com/devcodex-labs/intent-runtime/actions/runs/38686149645) passed; historical engineering/package regression, not future commits or model semantics |
| 2026-10-15 | Actual MCP SDK 2.3.1, three declared protocols | [Example checker](https://github.com/devcodex-labs/intent-runtime/blob/f36f11163c4cbe7ea492fd4673a6c81197a0d0aa/scripts/check-doc-examples.mjs) uses controlled candidates and real core/Validator; protocol/field-chain evidence, not actual model acceptance |
| 2026-10-14 | Linux, Codex CLI 0.162.1, gpt-6.1-sol, high reasoning | Current-model prepare/accept and semantic samples ran; this specific configuration does not guarantee all model inputs |

Judge recognition under your actual model configuration and include model/client versions in reports. Controlled executors verify structure and call flow, not model accuracy.

[Complete scenarios](/api/response#complete-scenarios-and-multi-turn-material) use fixed candidates processed by the real core and real Validator where business fields exist. They cover requirements, hierarchy, multiple turns, facts, ambiguity, and field states. They are contract examples, not provider accuracy reports. No-Schema examples do not add artificial business validation.

<span id="更新与运行边界" aria-hidden="true"></span>
<span id="选择发行版本" aria-hidden="true"></span>

## Updates and runtime boundaries

Update with npm install @devcodex/intent-runtime. See the [changelog](https://github.com/devcodex-labs/intent-runtime/blob/main/CHANGELOG.md) and [Codex maintenance](/operations/codex).

Installing the package does not automatically process every client message. Default timeoutMs=0 adds no overall recognition deadline; connection closure, service restarts, and client tool deadlines can still affect calls. Short mechanism checks do not guarantee continuous connections lasting hours or days.

<span id="遇到问题" aria-hidden="true"></span>

## Get help

For Codex, run doctor using the [maintenance guide](/operations/codex). For recognition failures inspect code/stage through [Errors](/api/errors). Include package/Node/client versions, OS, reproducible input, and error summaries when opening [GitHub Issues](https://github.com/devcodex-labs/intent-runtime/issues). Review material for credentials or sensitive content before publishing it.
