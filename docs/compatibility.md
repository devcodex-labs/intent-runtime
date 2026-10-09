# Compatibility

Target runtime: Node.js >=22.12.0, ESM and TypeScript NodeNext. No CJS build. Windows/Linux CI matrix is configured for deterministic contracts and package installation; this Linux workspace has verified Node 22.12.0 and 24.19.0. Windows CI and desktop support require actual runs.

Pinned core: schema-dsl 3.0.4, jsonc-parser 3.3.1, bcp-47 2.1.1. Tested optional peers: openai 7.30.1 and @modelcontextprotocol/sdk 1.32.1. Other versions are not automatically verified. Development uses typescript-eslint 8.55.0 so its visitor dependency supports Node 22.12.0; ESLint 9.39.4 is retained for that minimum runtime and emits its upstream deprecation notice. The registry package supplying language records uses CC0-1.0.

API capability is a caller assertion about the selected model, not automatic discovery. Strict-schema target defaults to nativeJsonSchema: true; explicitly unsupported targets fail rather than silently downgrade. Model names are not hardcoded. maxOutputTokens defaults to 8192 and can be explicitly set for a supported target. OpenAI data uses JSON object mode; xAI data uses the predefined plain-text mapping with strict local JSON checks. SDK network retries are disabled.

Language registration snapshot: language-subtag-registry 0.4.2, IANA File-Date 2025-08-25. Source and SHA-256 are shipped with the records. The current environment could not re-fetch IANA; this is a dated baseline, not a claim of current registration completeness. Extension identifiers t/u follow RFC 6497/6067; opaque payloads are preserved after BCP 47 syntax parsing. registry:refresh updates the official snapshots when network access is available, followed by review and tests.

Verification requirements:
- Automated tests cover deterministic pipeline contracts, API mapping, SDK MCP transport and isolated package installation. Controlled candidates and mock fetch do not measure target-model accuracy.
- Check actual OpenAI/xAI generation, independent semantic quality, repeated target-model stability, Windows and Codex desktop in the selected target environments.
- Structural validation and source-quote matching do not independently establish correct meaning or extraction completeness.
- Keep evaluation reports, scoring records and raw evidence outside the project; see [local testing](local-testing.md) for the default output location.

Do not record an unrun test as passed. Record actual provider/model, SDK/client/platform, Prompt version, language tag, outcomes and failures.
