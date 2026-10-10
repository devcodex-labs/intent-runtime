# intent-runtime

A TypeScript / Node.js library for expressing the current effective user request as default intents plus selected schema-dsl business fields.

**Development preview:** target V1 is implemented with deterministic contract tests. Real OpenAI/xAI models and Codex desktop semantics require local validation; this is not a release acceptance claim.

Requires Node.js >=20.0.0. ESM only. The package identity is @devcodex-labs/intent-runtime; existing 0.1.0 prototype exports are not retained.

## 中文文档

首期站点提供中文内容，中文验证确认后再翻译英文。

- [快速开始](https://github.com/devcodex-labs/intent-runtime/blob/main/website/content/guide/quick-start.md)
- [Codex CLI](https://github.com/devcodex-labs/intent-runtime/blob/main/website/content/integrations/codex-cli.md) / [Codex Desktop](https://github.com/devcodex-labs/intent-runtime/blob/main/website/content/integrations/codex-desktop.md)
- [API 参考](https://github.com/devcodex-labs/intent-runtime/blob/main/website/content/api/intent.md) / [错误处理](https://github.com/devcodex-labs/intent-runtime/blob/main/website/content/api/errors.md)

站点在独立 `website/` 包中维护。使用 Node 24 开发或构建站点，库本身仍支持 Node 20.0.0：

~~~bash
npm ci --prefix website
npm run docs:dev
~~~

## Global installation

Once this preview is released to npm's default tag, install from any directory:

~~~bash
npm install -g @devcodex-labs/intent-runtime
~~~

Direct global installation automatically configures supported local clients (currently Codex CLI and desktop), installs the recognition Skill and checks the actual MCP connection. Local or indirect dependency installation does not change client configuration. Automatic configuration requires npm lifecycle scripts to run; if they were disabled, run `intent-runtime doctor --repair`. Reload the client after installation. Optional maintenance: `intent-runtime doctor`, `doctor --repair` and `clean`. Updates preserve existing business configuration and user-edited instructions.

## Develop

~~~bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run smoke:package
npm run smoke:installation
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

## Codex

The MCP path uses the current Codex model through prepare/accept tools. It does not need a model API key. The MCP SDK is installed with the module. Global installation registers the user-level stdio entry and recognition Skill for Codex CLI and desktop; source development can also configure the entry manually. Explicitly activate the workflow to validate actual model use.

See the [Codex workflow](integrations/codex/workflow.md), [configuration example](examples/codex/intent.config.mjs) and [evaluation tools](evaluations/README.md).

## Public entries

| Entry | Exports |
|---|---|
| @devcodex-labs/intent-runtime | Intent, public contracts, errors and constants |
| @devcodex-labs/intent-runtime/adapters/api | createApiExecutor |
| @devcodex-labs/intent-runtime/bridge | createIntentBridge |
| @devcodex-labs/intent-runtime/mcp | serveIntentMcp |
| intent-runtime-mcp --config path.mjs | Trusted config + stdio MCP service |
| intent-runtime doctor / clean | Optional client diagnostics, repair and owned-configuration cleanup |

Only runtime files, package metadata, integration instructions and examples are packaged. No credentials or evaluation outputs are published.

MIT.
