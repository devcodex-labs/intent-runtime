# Integration examples

Use [Installation](https://devcodex-labs.github.io/intent-runtime/guide/installation.html) for V2, Node.js >=20, and ESM. The site provides complete copyable files. Repository examples are not included in the npm package.

| File | Purpose | Prerequisites |
|---|---|---|
| api/basic-en.mjs / api/basic-en.ts | English JavaScript / TypeScript goal and constraint recognition, no business Schema | Local runtime; INTENT_API_KEY/INTENT_MODEL |
| api/native-response-en.mjs | Default complete Native response used by the reference | Local runtime; INTENT_API_KEY/INTENT_MODEL |
| api/multi-turn-en.mjs | Complete VIP Schema and three-turn invalidation/correction | Local runtime; INTENT_API_KEY/INTENT_MODEL |
| api/parse-en.mjs | API recognition and ownership-aware field reading | Local runtime; INTENT_API_KEY/INTENT_MODEL |
| custom-executor-en.ts | Adapt your gateway with custom headers and reply mapping | ESM TypeScript; matching gateway request/reply protocol |
| codex/intent.host.config-en.mjs | Global Codex host configuration without package imports | Any trusted accessible directory; current client generates candidates |
| mcp/intent.executor.config-en.mjs | Standalone API-backed MCP configuration | Runtime resolvable from the configuration project; model credentials |
| mcp/attach.mjs + mcp/server-en.mjs | Preserve original tools, resources, prompts using the actual SDK | Existing compatible @modelcontextprotocol/server 2.3.1; host needs no extra API key |

Files without the -en suffix provide corresponding Chinese examples. Both languages share the same runtime API and contracts. Choose the complete program linked from your language's documentation.

After global installation, explicitly run `intent-runtime setup --host codex --config <existing-absolute-path.mjs>`. Ordinary installation does not alter client configuration. Files importing Builders or API adapters need locally resolvable dependencies; global packages are not an arbitrary ESM file's dependency directory.

JavaScript may use .js in an ESM project or standalone .mjs. CLI configuration supports both; compile TypeScript to ESM .js first. Start standalone MCP with `intent-runtime-mcp --config <absolute-path.js-or.mjs>`; add `--transport http --port 3001` for http://127.0.0.1:3001/mcp. Save attach.mjs and server-en.mjs in one directory and run `node server-en.mjs` for the complete SDK example. Keep stdout for MCP and application logs on stderr.

TypeScript examples compile in a project with type=module. Supply INTENT_GATEWAY_URL/INTENT_MODEL/INTENT_API_KEY through your application environment. Type checking does not prove a gateway accepts the candidate Schema or understands your inputs correctly.

For remote HTTP, declare `--public-origin https://mcp.example.com`; wildcard binds 0.0.0.0/:: require it. See [HTTP deployment](https://devcodex-labs.github.io/intent-runtime/integrations/mcp.html#remote-addresses-and-https-proxies) for TLS, authentication, and Host/Origin-preserving proxies.
