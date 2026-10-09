# Development

Use the existing checkout. Runtime compatibility starts at Node 20.0.0; use Node 24 for development tooling (some ESLint development dependencies declare a higher minimum patch version). Runtime and installation checks also run on the exact minimum Node version.

~~~bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run smoke:package
npm run smoke:installation
~~~

Tests use controlled candidates and custom fetch transports. No keys, model billing or desktop client are needed for default checks. Build copies the reviewed language data; it never downloads registry data. smoke:package creates and removes an isolated temporary installation.

Core depends only on public contracts, Schema/language/validation helpers and prompts. API adapters do not import the pipeline. MCP is a thin transport over the bridge. Imports and static cycles are checked by lint.

Actual provider calls require explicit local configuration and test:integration / evaluate. See local-testing.md. Evaluation outputs are ignored; preserve only reviewed fixtures and guidance in source control.
