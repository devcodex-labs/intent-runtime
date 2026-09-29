# Architecture

`intent-runtime` is a pure Node.js library. Its first release keeps the runtime small and dependency-light so consumers can embed it inside agents, adapters, webhooks, background workers, or application services.

## Boundaries

In scope:

- TypeScript types for intent records.
- Runtime creation and normalization helpers.
- Baseline natural-language parsing heuristics.
- External payload wrapping.
- Runtime validation and assertion helpers.
- Trace entries for auditability.

Out of scope for the initial project:

- CLI commands.
- HTTP API server.
- Browser UI.
- LLM provider integrations.
- Persistent storage.

## Module Layout

- `src/types.ts`: public contract types.
- `src/parse.ts`: input-to-record entry points.
- `src/normalize.ts`: defaulting and structural normalization.
- `src/validate.ts`: runtime validation.
- `src/trace.ts`: trace entry helpers.
- `src/index.ts`: package export surface.

## Design Notes

The public contract is intentionally explicit and versioned. `schemaVersion` starts at `1.0`, and future breaking schema changes should introduce a new record version with migration notes.
