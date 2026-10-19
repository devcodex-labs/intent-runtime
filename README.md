# Intent Runtime

**[Documentation](https://devcodex-labs.github.io/intent-runtime/)** · [Quick start](#install) · [Examples](https://github.com/devcodex-labs/intent-runtime/tree/main/examples) · [npm](https://www.npmjs.com/package/@devcodex/intent-runtime) · [Issues](https://github.com/devcodex-labs/intent-runtime/issues)

English is the default documentation language. [简体中文](https://devcodex-labs.github.io/intent-runtime/zh/) covers the same V2 API.

[![CI](https://github.com/devcodex-labs/intent-runtime/actions/workflows/ci.yml/badge.svg)](https://github.com/devcodex-labs/intent-runtime/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@devcodex/intent-runtime)](https://www.npmjs.com/package/@devcodex/intent-runtime)
[![Node.js >=20](https://img.shields.io/badge/node-%3E%3D20-339933)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

### Understand the request before taking action.

Turn natural-language requests into structured goals, constraints, changes, and schema-defined fields. Use the same core in your Node.js application, your MCP server, or a client that brings its own model.

For example, “Look up order 000123. Do not cancel the order” contains both a goal and a prohibition. Intent Runtime preserves both. Your application remains responsible for authorization, tools, and execution; the library only interprets the material you provide.

- **Goals and constraints together.** Preserve prohibitions, conditions, relationships, and unresolved questions alongside the requested action.
- **Your business fields.** Select schema-defined fields, validate their values, and keep identifiers such as `000123` as strings.
- **Explicit multi-turn state.** Supply context and a baseline to track changes without hidden conversation history.
- **Your model, your transport.** Use Responses, Chat Completions, a custom executor, or the MCP client's current model.

[Install and run](#install) · [Model APIs and gateways](#connect-a-model-or-gateway) · [MCP](#run-a-standalone-mcp-service) · [Codex](#use-the-current-codex-model) · [Contributing](#contributing)

## Choose an integration

| Your application | Start here |
|---|---|
| Node.js application | `Intent.parse` with a model API or your own model executor |
| Standalone MCP service | An ESM configuration file; connect through stdio or HTTP |
| Existing MCP server | `createIntentMcpAdapter` from `@devcodex/intent-runtime/mcp`; keep your existing transport and tools |
| Codex using its current model | Explicit `setup` registration and the prepare/accept/cancel tools |

Start with the application example below. To reuse a client's current model, choose MCP `host` mode. To call a model configured on your server, choose `executor` mode. Either mode works over stdio or Streamable HTTP.

## Install

**Intent Runtime V2** requires Node.js 20 or later and ESM. In your application directory, run:

```bash
npm install @devcodex/intent-runtime
```

npm installs the required dependencies, including the required `schema-dsl` peer with normal npm peer resolution. No separate installation is needed for this quick start.

JavaScript and TypeScript use the same API, and the package includes type declarations. For `.js` files, set `"type": "module"` in your project's `package.json`; a standalone `.mjs` file needs no module-type setting. Compile TypeScript to ESM before running it. See the [JavaScript/TypeScript quick start](https://devcodex-labs.github.io/intent-runtime/guide/quick-start.html) for both versions.

## Make your first call

Set your model credentials. These names are read by the example, not automatically by the library.

```bash
# Bash / zsh
export INTENT_API_KEY='your-api-key'
export INTENT_MODEL='your-model-name'
```

```powershell
# PowerShell
$env:INTENT_API_KEY = 'your-api-key'
$env:INTENT_MODEL = 'your-model-name'
```

Save the following as `basic.mjs` inside the project where you installed the package. It uses the OpenAI Responses API and identifies goals and constraints without a business schema:

<!-- example: examples/api/basic-en.mjs -->
```js
import {Intent, IntentError} from '@devcodex/intent-runtime';
import {createApiExecutor} from '@devcodex/intent-runtime/adapters/api';

const apiKey = process.env.INTENT_API_KEY;
const model = process.env.INTENT_MODEL;
if (!apiKey || !model) throw new Error('Set INTENT_API_KEY and INTENT_MODEL in your environment.');
const intent = new Intent({
  language: 'en',
  executor: createApiExecutor({provider: 'openai', apiKey, model}),
});
try {
  const result = await intent.parse({input: 'Look up order 000123. Do not cancel the order.'});
  console.log(JSON.stringify(result, null, 2));
  // Read goals and constraints from effective; no order query is executed.
  console.log('Goals:', result.effective.intents.map(node => node.goal));
  console.log('Issues:', result.issues.map(issue => issue.message));
} catch (error) {
  if (!(error instanceof IntentError)) throw error;
  console.error(JSON.stringify(error.toJSON()));
  process.exitCode = 1;
} finally {
  await intent.dispose();
}
```

```bash
node basic.mjs
```

The output contains the query goal and the prohibition against cancellation; it does not query or cancel an order. Read goals and constraints from `effective.intents`, and missing or ambiguous information from `issues`. Exact wording depends on your model.

### Read and extend the result

- `effective` is the current intent tree, including goals, constraints, and inputs.
- `fields` defaults to `[]`: intent recognition still runs, but no schema fields are selected. Add a schema and select fields when you need [order IDs or other business data](https://devcodex-labs.github.io/intent-runtime/guide/fields.html).
- Check each field's `fieldResults` and related `issues` before using its value. A root `complete` status does not guarantee that every field is valid or that any business action has run.
- Pass `context` or a previous `effective` value as `baseline` explicitly for [multi-turn requests](https://devcodex-labs.github.io/intent-runtime/guide/multi-turn.html). Instances do not retain implicit conversation history.

See [reading results](https://devcodex-labs.github.io/intent-runtime/guide/results.html) for field ownership, facts without a matching operation, positive requirements in `constraints`, and deliverables in `expectedOutput`.

## Connect a model or gateway

| Your model service | Configuration |
|---|---|
| OpenAI or xAI Responses | `createApiExecutor({provider, apiKey, model})`; Responses is the default |
| Responses-compatible gateway | Add the API root as `baseURL` |
| Chat Completions-compatible gateway | Add `protocol: 'chat-completions'` and `baseURL` |
| Another protocol, existing SDK, or custom authentication headers | Implement `ModelExecutor.generate` around your existing model call |

For a gateway endpoint such as `https://gateway.example.com/v1/chat/completions`, use `baseURL: 'https://gateway.example.com/v1'`. The adapter appends the protocol endpoint. `format: 'text'` is available when your service does not support JSON Schema output; the returned candidate JSON is still validated.

A custom executor receives instructions, input, an output schema, and a cancellation signal. It returns model-generated candidate text; Intent Runtime validates it and assembles the final result. You do not need to build a new gateway service. See [model APIs and custom executors](https://devcodex-labs.github.io/intent-runtime/integrations/api.html) for complete configuration and examples.

## Run a standalone MCP service

Save this trusted configuration as `intent.host.config.mjs`. Use `.js` instead if it belongs to an ESM project. This configuration reuses the MCP client's model and requires no separate model API key:

```js
export default {
  mode: 'host',
  instances: {main: {language: 'en'}},
};
```

For a local installation, run the command from your application directory with an absolute configuration path:

```bash
npx --no-install intent-runtime-mcp --config /absolute/path/intent.host.config.mjs
```

The command uses stdio by default; your MCP client starts and manages that process. Configure the client with the installed executable's absolute path, or use `npx --no-install` from the application directory. For Streamable HTTP, start it in a terminal:

```bash
npx --no-install intent-runtime-mcp --config /absolute/path/intent.host.config.mjs --transport http --port 3001
```

Connect the client to `http://127.0.0.1:3001/mcp`. Change the listener with `--host`, `--port`, and `--path`. Set `--public-origin https://mcp.example.com` when using a public domain or HTTPS proxy; wildcard listeners require an explicit public origin. See the [remote deployment example](https://devcodex-labs.github.io/intent-runtime/integrations/mcp.html#远程地址与-https-代理). HTTP supports the stateful MCP 2025-06-18 and 2025-11-25 protocols; stdio also supports 2026-07-28. Authentication and HTTPS belong to your deployment layer.

Host mode exposes `intent_runtime_prepare`, `intent_runtime_accept`, and `intent_runtime_cancel` by default; executor mode exposes `intent_runtime_parse`. Embedded adapters use the same names, so ordinary integrations need no `toolPrefix`. Multiple instances share the tool set and use `instance` for selection. An optional extra prefix such as `orders_` produces `orders_intent_runtime_prepare`; merged tool names must still be unique.

Ask your client to use the intent tools to identify the goal and prohibition in the example request. It should use `intent_runtime_prepare`, produce a candidate with its current model, and submit it through `intent_runtime_accept` in the same session. The tools do not automatically process every chat message. See [MCP client configuration and usage](https://devcodex-labs.github.io/intent-runtime/integrations/mcp.html).

For an existing MCP server, start with the [four integration changes](https://devcodex-labs.github.io/intent-runtime/integrations/mcp-sdk.html); keep your existing transport, resources, prompts, and tool handlers.

## Use the current Codex model

Install the commands globally for use outside a particular project:

```bash
npm install -g @devcodex/intent-runtime
intent-runtime setup --host codex --config /absolute/path/intent.host.config.mjs
```

Use the trusted configuration above or follow the [Codex integration guide](https://devcodex-labs.github.io/intent-runtime/integrations/codex.html) to add business fields. Reload the client after setup. Ordinary installation does not modify Codex configuration; registration is explicit. The supplied Skill guides tool use when invoked and does not take over every message.

Setup protects existing entries and user edits. See [Codex maintenance](https://devcodex-labs.github.io/intent-runtime/operations/codex.html) for diagnostics, repair, and cleanup.

## Troubleshooting

| Symptom | What to check |
|---|---|
| Missing model credentials | Set both variables in the terminal that runs the application; verify the model name and endpoint with your provider |
| `MODEL_AUTH_FAILED` / `MODEL_RATE_LIMITED` | Check the API key, provider access, and quota; use the [error guide](https://devcodex-labs.github.io/intent-runtime/api/errors.html) for recovery |
| A `.js` configuration does not load | Check the absolute path and ESM project setting; use `.mjs` for a standalone file |
| MCP command not found | Use the installed executable's absolute path, or install globally; on Windows use a supported `.cmd` launcher or `node` with `dist/cli/mcp.js` |
| HTTP connection fails | Check the running process, host, port, path, and supported protocol; keep the negotiated session ID |
| Codex does not list the tools | Run `intent-runtime doctor --host codex`; see [registration maintenance](https://devcodex-labs.github.io/intent-runtime/operations/codex.html) |
| The result has missing or ambiguous data | Inspect `issues` and `fieldResults`, then supply the missing material explicitly |

## Documentation

The full documentation is available in English by default, with an equivalent [Simplified Chinese edition](https://devcodex-labs.github.io/intent-runtime/zh/):

- [Quick start](https://devcodex-labs.github.io/intent-runtime/guide/quick-start.html) and [configuration](https://devcodex-labs.github.io/intent-runtime/guide/configuration.html)
- [Complete response reference](https://devcodex-labs.github.io/intent-runtime/api/response.html) and [multi-turn requests](https://devcodex-labs.github.io/intent-runtime/guide/multi-turn.html)
- [MCP](https://devcodex-labs.github.io/intent-runtime/integrations/mcp.html), [Codex](https://devcodex-labs.github.io/intent-runtime/integrations/codex.html), and [model APIs](https://devcodex-labs.github.io/intent-runtime/integrations/api.html)
- [Scenarios](https://devcodex-labs.github.io/intent-runtime/examples/index.html), [validation scope](https://devcodex-labs.github.io/intent-runtime/testing/validation.html), and [source examples](https://github.com/devcodex-labs/intent-runtime/tree/main/examples)

## Contributing

Bug reports, reproducible examples, and pull requests are welcome. For an issue, include the package, Node.js, model and client versions, the input, and the observed result. Review any credentials or private data before sharing it.

```bash
git clone https://github.com/devcodex-labs/intent-runtime.git
cd intent-runtime
npm ci
npm run typecheck
npm run lint
npm test
npm run test:release
```

Documentation lives in `website/content`; runnable examples live in `examples`. To check documentation changes, run `npm --prefix website ci` and `npm run docs:check`. See the [release guide](https://github.com/devcodex-labs/intent-runtime/blob/main/RELEASING.md) for maintainers.

Engineering tests and real-provider/client verification have separate scopes; fixture pass counts are not model accuracy measurements. See [CHANGELOG](CHANGELOG.md) for version history. Released under the [MIT License](LICENSE).
