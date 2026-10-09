# Development

Use the existing checkout; Node >=22.12.0 and npm are required.

~~~bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run smoke:package
~~~

Tests use controlled candidates and custom fetch transports. No keys, model billing or desktop client are needed for default checks. Build copies the reviewed language data; it never downloads registry data. smoke:package creates and removes an isolated temporary installation.

Core depends only on public contracts, Schema/language/validation helpers and prompts. API adapters do not import the pipeline. MCP is a thin transport over the bridge. Imports and static cycles are checked by lint.

Actual provider calls require explicit local configuration and test:integration / evaluate. See local-testing.md. Evaluation outputs are ignored; preserve only reviewed fixtures and guidance in source control.
