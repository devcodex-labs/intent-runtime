<span id="接入-codex" aria-hidden="true"></span>

# Connect Codex

The current Codex model generates a candidate; Intent Runtime validates it and returns structured intent. This path needs no additional model API key. See [Compatibility](/testing/validation) for CLI and Desktop loading and verification boundaries.

<span id="1-保存配置" aria-hidden="true"></span>

## 1. Save configuration

In an ESM project, save intent.host.config.js, for example D:\\Worker\\my-app\\intent.host.config.js, with `"type":"module"` in package.json. Use .mjs for a standalone file without project configuration. Both extensions accept the same content. This configuration imports no package, so it can live outside node_modules projects.

<!-- example: examples/codex/intent.host.config-en.mjs -->
```js
export default {
  mode: 'host',
  instances: {orders: {language: 'en', schema: {
    type: 'object',
    properties: {orderId: {type: 'string', description: 'An order ID explicitly supplied by the user; preserve leading zeros; applies only to order intents'}},
  }}},
};
```

The file is trusted Node.js code. If you add package imports, those dependencies must resolve from its directory. Global installation does not change local ESM resolution.

<span id="2-安装与登记" aria-hidden="true"></span>

## 2. Install and register

Complete [global installation](/guide/installation). Replace the configuration path with its real absolute location. Installation provides commands; setup changes this module's client registration.

PowerShell:

```powershell
intent-runtime setup --host codex --config "D:\Worker\my-app\intent.host.config.js"
```

macOS/Linux:

```bash
intent-runtime setup --host codex --config "$PWD/intent.host.config.js"
```

setup registers user-level MCP and installs the Skill in host mode. Reload configuration as required by your client; start a new CLI session. You should discover intent_prepare, intent_accept, and intent_cancel. Ordinary npm installation does not change client configuration.

<span id="3-发起识别" aria-hidden="true"></span>

## 3. Recognize a request

Ask Codex explicitly:

```text
Use intent-runtime to recognize: "Look up order 000123. Do not cancel the order."
Extract the order ID and show the user's goal and prohibition. Do not perform order operations.
```

Expect the lookup goal, the prohibition, and string "000123". The installed Skill guides the tool handoff without requiring you to repeat protocol instructions. It does not automatically process all messages.

<details>
<summary>Tools, candidates, and final results</summary>

| What you see | Meaning | Final recognition result? |
|---|---|---|
| HostTask from prepare | instructions, input, outputSchema, handoff identity | No |
| Model-generated candidateText | Candidate understanding submitted to accept | No |
| IntentResult from accept | Validated full structure; inspect field states and issues | Yes |
| Ordinary chat reply or cancel status | Explanation or end of handoff | No |

Visible tools without prepare/accept prove only registration. Verify the complete chain on first use. Supply relevant material explicitly on subsequent recognition; an MCP connection does not store your business conversation.

</details>

<span id="工具与回复" aria-hidden="true"></span>

## Tools and replies

Use prepare → current model candidate → accept; cancel if it cannot complete. See [Host handoff](/api/mcp#host-handoff) for parameters, replay, budgets, and record retention. Records support this recognition, not a durable application session.

<span id="手动填写-mcp-表单" aria-hidden="true"></span>

## Manual MCP form

| Field | Value |
|---|---|
| Name | intent-runtime |
| Type | STDIO |
| Command | Actual intent-runtime-mcp executable path |
| Argument 1 | --config |
| Argument 2 | Absolute configuration path |
| Working directory | Accessible local directory; does not change config-module package resolution |

Manual command/args registration does not install the Skill. Use the explicit request above. Logs go to stderr; stdout carries MCP only.

<span id="检查与排障" aria-hidden="true"></span>

## Diagnose

```bash
intent-runtime doctor --host codex
```

| Symptom | Check |
|---|---|
| Command missing | Global npm bin on client PATH; use an absolute executable path if needed, including .cmd where supported |
| Configuration fails to load | Absolute .js/.mjs path; type=module for .js; local dependencies in its project |
| Only intent_parse appears | Check executor versus host mode and reload the client |
| Model never completes a candidate | End recognition; do not treat ordinary chat as a final Result |
| HOST_REQUEST_NOT_FOUND | Session change/restart; prepare again with complete material |

doctor does not call a model. See [Maintenance](/operations/codex) for update, repair, cleanup, dry-run, flags and exit codes.
