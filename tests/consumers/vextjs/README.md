# Actual VextJS source consumer

This development fixture builds and calls the real `createVextMcpServer` from
`devcodex-labs/vextjs` commit `2458a718179d58e8fabc6e5577f58e4da6be6f1e`
(VextJS 2.0.0). It verifies both adapter modes against MCP server 2.0.0 and
client 2.3.1, including the original seven tools, eleven resources, four prompts,
read-only calls, complete recognition, client request cancellation with instance
reuse, original close hooks and output-schema/error-text handling.

Use the exact source archive with LF bytes. The fixture binds all 398 source,
license and package files to SHA-256; a different checkout fails instead of
being reported as the tested version. VextJS itself requires Node ^20.19.0 or
>=22.12.0. This does not raise intent-runtime's Node >=20.0.0 requirement.

Set `VEXTJS_SOURCE_ROOT` to the extracted source directory, then run:

```sh
npm run test:consumer
```

The runner creates a separate temporary consumer, installs the locked SDK and
the freshly packed intent-runtime, copies the public registration example,
bundles the actual source factory and uses a real SDK client. It writes build
output outside the source checkout, checks source identity before and after,
and removes its own successful fixture. A failed fixture is retained for diagnosis.
Cloud callers set TMPDIR/TEMP/TMP and npm_config_cache outside their repository.
Missing source exits 2 and is **not run**, not passed.

This verifies development source consumption. VextJS does not publish a public
`vextjs/mcp` factory export; this fixture neither adds one nor claims the published
VextJS product already integrates intent-runtime. Its Apache-2.0 source remains
read-only and is not copied into this repository. Model candidates are controlled
fixtures, and no real provider or Codex client is executed.
