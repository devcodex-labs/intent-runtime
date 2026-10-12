# Integration examples

Use Node >=20.0.0. These examples use public intent-runtime exports. Run source
examples after `npm ci && npm run build`, or run the corresponding files included
in an installed package. MCP clients use SDK v1 1.32.1. The v2 registration file
requires the host's separate server 2.0.0; no upgrade of the core dependency is required.

| Path | Run | Result |
| --- | --- | --- |
| SDK API | `node examples/api/parse.mjs --fixture` | Direct seven-field result |
| Custom model function | `node examples/api/custom-executor.mjs --fixture` | Direct seven-field result |
| Bridge host collaboration | `node examples/bridge/recognize.mjs --fixture` | Complete task/data/result loop |
| Existing MCP, server executor | `node examples/mcp/executor/client.mjs --fixture` | Original tools/resources/prompts plus single-call intent_parse |
| Existing MCP, host candidates | `node examples/mcp/host/client.mjs --fixture --repair` | Original tools and three recognition tools, including controlled repair |
| Production stdio CLI | `node examples/mcp/stdio/client.mjs --fixture` | Production CLI list/call and complete host-candidate loop |
| SDK v2 registration | `examples/mcp/sdk-v2/registration.mjs` | Copy into the host's SDK2 registration environment; call it with the original tool-name registry |

`--fixture` explicitly uses controlled candidates for the exact documented order
request. It verifies the engineering path and never measures semantic accuracy.
The offline data contains global and action requirements, prohibitions and an
identifier with leading zeros. `--no-data` on the API example selects fields=[];
`--repair` on the host example deliberately submits malformed JSON once and is
allowed only with --fixture.

The API example forwards a native per-call signal and maps Ctrl+C to that call's
cancellation. It removes its signal handler and disposes its own instance after
settlement; shared application instances should remain owned by their caller.

For real API calls, omit --fixture and set INTENT_PROVIDER (openai or xai),
INTENT_MODEL, and INTENT_OPENAI_KEY or INTENT_XAI_KEY locally. Install the optional
`openai@6` SDK. No model name is inferred. The Bridge/client examples use this
explicit driver to simulate a host; an actual Codex host generates its own
candidates without configuring a model executor inside the library.

For a custom model function, set INTENT_MODEL_DRIVER to a trusted local module
exporting `generateText(request)`. It receives instructions, JSON payload, format,
stage and a native signal. Return complete JSON text or `{outcome:"refusal"}` /
`{outcome:"incomplete"}`. Use an isolated model turn and honor the signal.

The stdio CLI client expects the installed intent-runtime-mcp executable in the
consumer's node_modules/.bin or PATH. Source users can first pack the module and
install that archive in a separate consumer project. This is tested by
`npm run smoke:package`; it is not replaced by a test-only server.

Each client closes its own connection. Servers dispose the instances they created;
the adapter itself never disposes caller-owned instances or closes their servers.
Sample generators cancel their owned job when generation fails. Recognition never
executes the requested business action. Read the Chinese site for configuration,
wire results, cancellation, error text and the actual VextJS source fixture.
