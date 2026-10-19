<span id="选择接入方式" aria-hidden="true"></span>

# Choose an integration

Choose the task you are doing, then follow its model and configuration path. Intent Runtime structures supplied requests; your application continues to own order queries, code changes, and business tools.

| How you use it | Start here | Model source and prerequisites |
|---|---|---|
| Call it from Node.js | [Quick start](/guide/quick-start) | Explicit model API or custom executor |
| Reuse the current Codex model | [Connect Codex](/integrations/codex) | Current client generates candidates; no additional API key |
| Run standalone MCP | [stdio / HTTP service](/integrations/mcp) | host uses the client model; executor uses a configured server-side API |
| Extend existing MCP tools | [Complete integration](/integrations/mcp-sdk) | Preserve the existing connection/tools; choose host or executor |
| Use your own gateway | [Protocols and gateways](/integrations/api#connect-your-gateway) | Configure compatible Responses/Chat Completions; adapt other protocols |

| Path | Additional model key? | Connection and state ownership |
|---|---|---|
| Node / executor | Required when using the configured API | Application owns calls, history, and business state |
| Codex / host | No additional key | Codex provides the model; Runtime manages this handoff |
| Existing MCP server | Depends on the selected mode | Original SDK owns transport; one session per logical client |

<span id="各入口要准备什么" aria-hidden="true"></span>

## Prepare your integration

| Task | Where to configure | How to start | First success |
|---|---|---|---|
| Node.js application | JS/TS in the application project; your credential source | Run the application file | parse returns IntentResult with goals and constraints |
| Current Codex model | Trusted accessible .js/.mjs; absolute setup path | Reload the client or open a new CLI session | Three host tools visible and accept returns the final result |
| Existing MCP server | Existing service code and local dependencies | Original SDK startup | Both original and added tools work |
| Standalone MCP | Trusted .js/.mjs; executor also needs model credentials | stdio by default; add HTTP startup options for HTTP | Client can list and call the selected mode's tools |

Global installation does not change local ESM dependency resolution. A configuration importing packages belongs in a project with those dependencies. HTTP can run standalone or in an existing server. Follow the corresponding guide without reading all types first.

Complete [installation](/guide/installation), then your chosen path. Native, standalone MCP, and embedded MCP share the same core and successful [IntentResult](/guide/results).

<span id="host和executor有什么区别" aria-hidden="true"></span>

## Host and executor modes

- **host**: prepare returns material; the current client model generates a candidate; accept validates and assembles the result. The server does not silently call a second model.
- **executor**: Native parse or MCP intent_runtime_parse calls the configured executor. The caller supplies a working model and credentials.

Registering tools exposes capabilities; it does not automatically intercept every chat message. See [Compatibility](/testing/validation).
