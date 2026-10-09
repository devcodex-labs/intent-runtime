# Changelog

## Unreleased — global installation

- Support Node.js >=20.0.0, including actual minimum-version package and stdio checks.
- Automatically configure discovered local clients on direct global npm installation; Codex is the first adapter. Preserve business config, unrelated settings and user-edited instructions.
- Add optional intent-runtime doctor, doctor --repair and clean commands, private ownership records, backups and failure recovery.
- Install the MCP SDK with the module and use openai 6.49.0 as the optional API test baseline compatible with Node 20.
- Verify global installation, reinstall, changed prefix, disabled lifecycle scripts, local/indirect installation isolation and cleanup with real packaged fixtures.
- Recover interrupted installation/cleanup from a private journal; preserve conflicting user edits and release locks even when their initial write fails. Validate incomplete ownership records and allow retry after a failed first initialization without inventing replacements for established business config.
- Add filesystem fault checks and real-process maintenance tests for contention, interruption, imported business config/env, version changes, stale Node paths and uninstall/reinstall. Isolate native discovery in filesystem tests and compare canonical installation paths across platforms.

## 1.0.0-dev.0 — 2026-10-09

- Implement the latest object-only Intent.parse request, default en, registered language validation and explicit context.
- Add native schema-dsl snapshots, top-level projection, strict JSON/number/source checks and selected-field conclusions.
- Add shared core/data pipeline, bounded repair, partialResult, deadlines, disposal and configurable limits.
- Add OpenAI/xAI Responses adapters and session-bound prepare/accept/cancel bridge with a local stdio MCP entry.
- Add deterministic contracts, SDK/MCP transport tests, installed-package smoke and 81 numbered semantic scenarios.
- Replace prototype exports; real-model and desktop acceptance remain manual and unverified.
