# intent-runtime

A TypeScript / Node.js library for expressing the current effective user request as default intents plus selected schema-dsl business fields.

**Development preview:** target V1 is implemented with deterministic contract tests. Real OpenAI/xAI models and Codex desktop semantics require local validation; this is not a release acceptance claim.

Requires Node.js >=22.12.0. ESM only. The package identity is @devcodex-labs/intent-runtime; existing 0.1.0 prototype exports are not retained.

## Develop

~~~bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run smoke:package
~~~

## API usage

Install the optional openai peer when using the API adapter. Provider, key and model are always explicitly supplied by the caller.

~~~js
import { s } from "schema-dsl/pure";
import { Intent } from "@devcodex-labs/intent-runtime";
import { createApiExecutor } from "@devcodex-labs/intent-runtime/adapters/api";

const intent = new Intent({
  schema: s({
    orderId: s("string!").description("Current order identifier; preserve leading zeros and never guess.")
  }),
  executor: createApiExecutor({
    provider: "openai",
    apiKey: process.env.INTENT_OPENAI_KEY,
    model: process.env.INTENT_MODEL
  })
});

try {
  const result = await intent.parse({ input: "查询订单 000123", fields: ["orderId"] });
  console.log(result);
} catch (error) {
  // For data failures, error.partialResult preserves validated default fields.
  console.error(error.toJSON());
} finally {
  intent.dispose();
}
~~~

- Default structured language is en; registered BCP 47 tags are checked using the shipped snapshot.
- Omitted fields attempts all defined top-level extensions; [] skips data and keeps the entire default result.
- Context is explicit text or chronological user/assistant/tool messages.
- The library does not execute actions, load files/history, infer permission, or choose tools.
- ready is an understanding status, never an authorization or execution gate.
- Schema validation and source matches do not prove semantic truth. Review actual model outputs.

## Codex desktop

The MCP path uses the current desktop model through prepare/accept tools, not an independent Codex process. It does not need a model API key. Install the optional @modelcontextprotocol/sdk peer, configure the local stdio entry and explicitly activate the workflow.

See [本地配置与手动测试](docs/local-testing.md), [Codex workflow](integrations/codex/workflow.md), [usage](docs/usage.md), [errors](docs/errors.md) and [compatibility](docs/compatibility.md).

## Public entries

| Entry | Exports |
|---|---|
| @devcodex-labs/intent-runtime | Intent, public contracts, errors and constants |
| @devcodex-labs/intent-runtime/adapters/api | createApiExecutor |
| @devcodex-labs/intent-runtime/bridge | createIntentBridge |
| @devcodex-labs/intent-runtime/mcp | serveIntentMcp |
| intent-runtime-mcp --config path.mjs | Trusted config + stdio MCP service |

Only dist, selected usage documents and integration examples are packaged. No credentials or evaluation outputs are published.

MIT.
