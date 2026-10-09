# Compatibility

Target runtime: Node.js >=20.0.0, ESM and TypeScript NodeNext. No CJS build. CI covers the exact minimum runtime and current Node on Windows/Linux/macOS for deterministic contracts and isolated package installation. Native desktop discovery, loading and model semantics require actual client runs; CI's simulated user host is not desktop acceptance.

Pinned core: schema-dsl 3.0.4, jsonc-parser 3.3.1, bcp-47 2.1.1. MCP SDK 1.32.1 and toml-eslint-parser 0.10.0 are regular dependencies. The optional API peer is openai >=6.49.0 <7, with 6.49.0 as the test baseline; SDK 7.x requires a higher Node baseline. Development uses Node 24 for ESLint 9.39.4 and typescript-eslint 8.55.0. Vitest 3.2.6 with Vite 6.4.1 supports minimum-runtime tests. Other versions are not automatically verified. The registry package supplying language records uses CC0-1.0.

API capability is a caller assertion about the selected model, not automatic discovery. Strict-schema target defaults to nativeJsonSchema: true; explicitly unsupported targets fail rather than silently downgrade. Model names are not hardcoded. maxOutputTokens defaults to 8192 and can be explicitly set for a supported target. OpenAI data uses JSON object mode; xAI data uses the predefined plain-text mapping with strict local JSON checks. SDK network retries are disabled.

Language registration snapshot: language-subtag-registry 0.4.2, IANA File-Date 2025-08-25. Source and SHA-256 are shipped with the records. The current environment could not re-fetch IANA; this is a dated baseline, not a claim of current registration completeness. Extension identifiers t/u follow RFC 6497/6067; opaque payloads are preserved after BCP 47 syntax parsing. registry:refresh updates the official snapshots when network access is available, followed by review and tests.

Verification requirements:
- Automated tests cover deterministic pipeline contracts, API mapping, SDK MCP transport and isolated package installation. Controlled candidates and mock fetch do not measure target-model accuracy.
- Check actual OpenAI/xAI generation, independent semantic quality, repeated target-model stability, Windows and Codex desktop in the selected target environments.
- Structural validation and source-quote matching do not independently establish correct meaning or extraction completeness.
- Keep evaluation reports, scoring records and raw evidence outside the project; see [local testing](local-testing.md) for the default output location.

Do not record an unrun test as passed. Record actual provider/model, SDK/client/platform, Prompt version, language tag, outcomes and failures.
