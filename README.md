# intent-runtime

A TypeScript / Node.js library for expressing the current effective user request as default intents plus selected schema-dsl business fields.

Requires Node.js >=20.0.0. ESM only. The package identity is @devcodex/intent-runtime.

## 中文文档

安装、接入指南和 API 参考见中文文档站。

[中文文档站](https://devcodex-labs.github.io/intent-runtime/)

- [快速开始](https://devcodex-labs.github.io/intent-runtime/guide/quick-start.html)
- [Codex CLI](https://devcodex-labs.github.io/intent-runtime/integrations/codex-cli.html) / [Codex Desktop](https://devcodex-labs.github.io/intent-runtime/integrations/codex-desktop.html)
- [API 参考](https://devcodex-labs.github.io/intent-runtime/api/intent.html) / [响应结构](https://devcodex-labs.github.io/intent-runtime/api/response.html) / [错误处理](https://devcodex-labs.github.io/intent-runtime/api/errors.html)

站点在独立 `website/` 包中维护。使用 Node 24 开发或构建站点，库本身仍支持 Node 20.0.0：

~~~bash
npm ci --prefix website
npm run docs:dev
~~~

## Global installation

Install from any directory:

~~~bash
npm install -g @devcodex/intent-runtime
~~~

Direct global installation automatically configures supported local clients (currently Codex CLI and desktop), installs the recognition Skill and checks the actual MCP connection. Local or indirect dependency installation does not change client configuration. Automatic configuration requires npm lifecycle scripts to run; if they were disabled, run `intent-runtime doctor --repair`. Reload the client after installation. Optional maintenance: `intent-runtime doctor`, `doctor --repair` and `clean`. Updates preserve existing business configuration and user-edited instructions.

A fresh installation creates a `default` instance with `language: "en"` and no business Schema. It recognizes default intents and returns `data: {}`. Define business fields through [configuration and named instances](https://devcodex-labs.github.io/intent-runtime/guide/configuration.html), then reload the client.

Before uninstalling, clean the managed client registration while the command is still available:

~~~bash
intent-runtime clean
npm uninstall -g @devcodex/intent-runtime
~~~

Cleanup preserves user-edited entries and business configuration; see [installation and maintenance](https://devcodex-labs.github.io/intent-runtime/guide/installation.html).

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

Install the optional openai peer when using the API adapter, and schema-dsl when importing its DSL directly. Provider, key and model are always explicitly supplied by the caller.

~~~bash
npm install @devcodex/intent-runtime openai schema-dsl
~~~

Set `INTENT_OPENAI_KEY` and `INTENT_MODEL` in the environment before running the example. See [provider configuration](https://devcodex-labs.github.io/intent-runtime/integrations/openai-xai.html#配置环境) for PowerShell instructions and xAI settings. These variable names are example conventions; the adapter receives explicit options.

~~~js
import { s } from "schema-dsl/pure";
import { Intent, IntentParseError } from "@devcodex/intent-runtime";
import { createApiExecutor } from "@devcodex/intent-runtime/adapters/api";

const apiKey = process.env.INTENT_OPENAI_KEY;
const model = process.env.INTENT_MODEL;
if (!apiKey || !model) throw new Error("Set INTENT_OPENAI_KEY and INTENT_MODEL before running this example.");

const intent = new Intent({
  schema: s({
    orderId: s("string!").description("Current order identifier; preserve leading zeros and never guess.")
  }),
  executor: createApiExecutor({
    provider: "openai",
    apiKey,
    model
  })
});

try {
  const result = await intent.parse({ input: "查询订单 000123", fields: ["orderId"] });
  console.log(result);
} catch (error) {
  if (!(error instanceof IntentParseError)) throw error;
  // For data failures, error.partialResult preserves validated default fields.
  console.error(error.toJSON());
} finally {
  intent.dispose();
}
~~~

`parse()` returns the seven-field `IntentResult` directly. Read `result.requirements` for global requirements, `result.intents[].requirements` for action-specific requirements, and `result.data.orderId` for the selected identifier. Complete responses, including nonempty requirements and nullable/nested business fields, are in the [response reference](https://devcodex-labs.github.io/intent-runtime/api/response.html).

- Default structured language is en; tags must specify an output language supported by the shipped BCP 47 registry snapshot.
- Omitted fields attempts all defined top-level extensions; [] skips data and keeps the entire default result.
- Context is explicit text or chronological user/assistant/tool messages.
- The library does not execute actions, load files/history, infer permission, or choose tools.
- ready is an understanding status, never an authorization or execution gate.
- Schema validation and source matches do not prove semantic truth. Review actual model outputs.

## Codex

The MCP path uses the current Codex model through prepare/accept tools. It does not need a model API key. The MCP SDK is installed with the module. Global installation registers the user-level stdio entry and recognition Skill for Codex CLI and desktop; source development can also configure the entry manually. Explicitly activate the workflow to validate actual model use.

See the [Codex workflow](https://github.com/devcodex-labs/intent-runtime/blob/main/integrations/codex/workflow.md), [configuration example](https://github.com/devcodex-labs/intent-runtime/blob/main/examples/codex/intent.config.mjs) and [evaluation tools](https://github.com/devcodex-labs/intent-runtime/blob/main/evaluations/README.md).

## Public entries

| Entry | Exports |
|---|---|
| @devcodex/intent-runtime | Intent, public contracts, errors and constants |
| @devcodex/intent-runtime/adapters/api | createApiExecutor, readCompletedResponse, ApiExecutorConfig type |
| @devcodex/intent-runtime/bridge | createIntentBridge and Bridge/session/request/reply types |
| @devcodex/intent-runtime/mcp | serveIntentMcp, MCP_TOOLS |
| intent-runtime-mcp --config path.mjs | Trusted config + stdio MCP service |
| intent-runtime doctor / clean | Optional client diagnostics, repair and owned-configuration cleanup |

Only runtime files, package metadata, integration instructions and examples are packaged. No credentials or evaluation outputs are published.

MIT.
