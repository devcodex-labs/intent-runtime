<span id="mcp-接入与使用" aria-hidden="true"></span>

# Connect MCP clients

Choose two independent things: **who calls the model**, and **how the client connects**.

| Model source | Use when | Tools |
|---|---|---|
| host: current client model | Reuse the current model without a second key | intent_prepare / intent_accept / intent_cancel |
| executor: server-configured model | Server already has an API or gateway | intent_parse |

| Connection | Supply | Connection owner |
|---|---|---|
| Standalone stdio | Trusted .js/.mjs configuration | Client starts intent-runtime-mcp as a subprocess |
| Standalone HTTP | Same configuration, bind address and port | Start the service; client connects to its /mcp URL |
| Existing MCP server | Intent, adapter, and SDK handlers | Your SDK server |

Both host and executor work over stdio or HTTP. Start with host below, then switch to a configured API if needed. Tool registration does not intercept every message.

<span id="独立-stdio-服务" aria-hidden="true"></span>
<span id="接入-mcp-与已有-tools" aria-hidden="true"></span>

## Standalone stdio

Complete [installation](/guide/installation). Codex registration is not required. Save intent.host.config.js in an ESM project, or use .mjs for a standalone file. Record its actual absolute path.

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

This trusted Node.js module imports no packages and can be saved independently. Choose the command for your installation location.

**Global installation:** run in a terminal to check startup, or have your MCP client start:

```bash
intent-runtime-mcp --config /absolute/path/intent.host.config.js
```

**Project-local installation:** run from the service project where you installed `@devcodex/intent-runtime`. This example uses a standalone `.mjs` configuration:

```bash
npx --no-install intent-runtime-mcp --config /absolute/path/my-service/intent.host.config.mjs
```

A local installation does not add the command to the system PATH. Install the package in the project first; `--no-install` prevents installing a missing package for this invocation, but you must still run from the correct service project.

Select STDIO in the client. With a **global installation** available on the client's PATH, clients supporting mcpServers can use:

```json
{
  "mcpServers": {
    "intent-runtime": {
      "command": "intent-runtime-mcp",
      "args": ["--config", "/absolute/path/intent.host.config.js"]
    }
  }
}
```

With a **project-local installation**, use absolute paths to Node and the installed entry. This does not depend on the client's working directory or npm command PATH:

```json
{
  "mcpServers": {
    "intent-runtime": {
      "command": "/absolute/path/to/node",
      "args": [
        "/absolute/path/my-service/node_modules/@devcodex/intent-runtime/dist/cli/mcp.js",
        "--config",
        "/absolute/path/my-service/intent.host.config.mjs"
      ]
    }
  }
}
```

Find Node with `node -p "process.execPath"` and replace every placeholder with its actual absolute path. Enter each args item separately in client forms. Windows paths can use `C:/Program Files/nodejs/node.exe` and `D:/Worker/my-service/...`; use `/` or escaped `\\` in JSON. Spaces inside a JSON path string do not require extra shell quotes.

For global commands missing from PATH, use the executable's absolute path as well. On Windows use .cmd if supported; otherwise use Node with the installed entry as above. Codex users can use [setup](/integrations/codex). stdout carries protocol only; inspect stderr for logs.

| Service configuration | Type / default | Rule |
|---|---|---|
| mode | executor or host / executor | Trusted server configuration; tools cannot switch it |
| instances | Record&lt;string, IntentConfig&gt; / required | Nonempty map; CLI creates and owns each Intent |
| toolPrefix | string / empty | Prefix every tool name; final names at most 128 characters |

executor instances require a [model executor](/integrations/api); host does not. --help/--version are supported. Invalid arguments exit 2, loading/startup failures exit 1, normal EOF or SIGINT/SIGTERM exits 0. Keep stdout for MCP and logs on stderr.

<span id="使用-http-与指定端口" aria-hidden="true"></span>

## HTTP and a custom port

Reuse the same configuration. For a global installation:

```bash
intent-runtime-mcp --config /absolute/path/intent.host.config.js --transport http --host 127.0.0.1 --port 3001 --path /mcp
```

For a project-local installation, run from the service project:

```bash
npx --no-install intent-runtime-mcp --config /absolute/path/my-service/intent.host.config.mjs --transport http --host 127.0.0.1 --port 3001 --path /mcp
```

The remote deployment examples below use the global command. For a project-local installation, prefix it with `npx --no-install` and run from the service project.

Expect `Intent MCP listening at http://127.0.0.1:3001/mcp`. Keep the process running and add a Streamable HTTP client connection:

```json
{
  "mcpServers": {
    "intent-runtime": {
      "url": "http://127.0.0.1:3001/mcp"
    }
  }
}
```

If the client uses a form instead, enter the same URL. Three host tools should appear. If the port is occupied, choose another and update the client URL. Stop with Ctrl+C.

| CLI option | Default | Purpose |
|---|---|---|
| --config | required | Absolute trusted .js/.mjs path |
| --transport | stdio | stdio or http |
| --host | 127.0.0.1 | HTTP bind address |
| --port | 3001 | HTTP port, 1–65535 |
| --path | /mcp | HTTP route without a query |
| --public-origin | unset | Public HTTP/HTTPS origin including a nondefault port; no path, credentials, query, or fragment |

These HTTP options belong to process startup, not Intent configuration. stdio rejects them. HTTP uses stateful Streamable HTTP with protocols 2025-06-18 / 2025-11-25; stdio also supports 2026-07-28. The client must support the selected protocol.

Retain the negotiated Mcp-Session-Id; prepare and accept need the same logical session. HTTP allows at most 128 sessions, reclaims sessions after 30 minutes without new requests, and limits bodies to 4 MiB. This is not durable business conversation storage. Default binding is local. Configure authentication, HTTPS, and public access in your deployment layer; the command does not manage OAuth or proxies.

<span id="远程地址与-https-代理" aria-hidden="true"></span>

### Remote addresses and HTTPS proxies

--host binds the process; --public-origin identifies the origin the client actually accesses. They may differ. Binding 0.0.0.0 or :: requires a public origin; a wildcard bind address is not a client URL.

For a controlled LAN:

```bash
intent-runtime-mcp --config /absolute/path/intent.host.config.js --transport http --host 0.0.0.0 --port 3001 --public-origin http://192.168.1.10:3001
```

Replace the IP and connect to http://192.168.1.10:3001/mcp. This does not add encryption or authentication. Public deployment belongs behind configured TLS and access controls.

For https://mcp.example.com/mcp, with local process binding:

```bash
intent-runtime-mcp --config /absolute/path/intent.host.config.js --transport http --host 127.0.0.1 --port 3001 --public-origin https://mcp.example.com
```

This Nginx route belongs inside an **existing TLS/access-controlled server block**. Your deployment supplies certificates, authentication, and the domain:

```nginx
location = /mcp {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_buffering off;
    proxy_read_timeout 3600s;
}
```

Clients use https://mcp.example.com/mcp. Preserve public Host, original Origin, MCP session/protocol headers, and streaming responses. Nondefault ports must match in public-origin and Host. Arbitrary X-Forwarded-* headers do not expand trust; do not rewrite an invalid Origin to bypass checks. Public Host must match the configured origin's Host; supplied Origin must match scheme, host, and port. Local diagnostic addresses remain available.

Validate connection, tool discovery, and prepare/accept in one session. Mismatching Host/Origin should return 403. Request-boundary tests do not replace validation of your actual proxy, certificates, authentication, and client.

<span id="使用所配-api-的完整配置" aria-hidden="true"></span>

### Complete API-backed configuration

Use this instead of host configuration. Save in a project with Intent Runtime installed, set INTENT_API_KEY and INTENT_MODEL, and start with its absolute path. It selects no business fields by default.

<!-- example: examples/mcp/intent.executor.config-en.mjs -->
```js
import {createApiExecutor} from '@devcodex/intent-runtime/adapters/api';
const apiKey = process.env.INTENT_API_KEY, model = process.env.INTENT_MODEL;
if (!apiKey || !model) throw new Error('Set INTENT_API_KEY and INTENT_MODEL.');
export default {mode: 'executor', instances: {main: {language: 'en', executor: createApiExecutor({provider: 'openai', apiKey, model})}}};
```

<span id="完成第一次识别" aria-hidden="true"></span>

## Complete the first recognition

In a tool-capable AI client, ask: “Use intent-runtime to recognize 'Look up order 000123. Do not cancel the order.' Extract the order ID, show the goal and prohibition, and do not perform order operations.”

Host mode lists intent_prepare, intent_accept, intent_cancel and needs the client model to complete the handoff. A client that only lists tools does not finish recognition. See [Host handoff](/api/mcp#host-handoff). Codex setup installs the corresponding Skill.

Executor mode can call:

```json
{
  "name": "intent_parse",
  "arguments": {"input": "Look up order 000123. Do not cancel the order."}
}
```

Without a Schema, do not select business fields. structuredContent should preserve the lookup and prohibition; [read the result](/guide/results). Host makes no additional API call; executor uses the configured model.

| Symptom | Next step |
|---|---|
| Startup fails or no tools | Absolute .js/.mjs, ESM configuration, local imports, client stderr |
| HTTP cannot connect | Bind address, port, /mcp path, running process |
| HTTP 403 | Public URL and --public-origin; preserve public Host/original Origin including nondefault port |
| Unexpected tool list | Check mode and reconnect |
| prepare without a final result | Complete accept in the same session using outputSchema; HostTask is not a result |
| isError=true | Read the error summary and follow [recovery](/api/errors) |

<span id="添加到已有-mcp-tools" aria-hidden="true"></span>

## Add tools to an existing service

Keep your SDK, transport, and tools; start with the [four integration points](/integrations/mcp-sdk). Existing HTTP services use the same adapter while retaining listener, authentication, and logical connections. Do not rebuild a host session for every HTTP request.

<span id="参数与协议参考" aria-hidden="true"></span>
<span id="adapter-api" aria-hidden="true"></span>
<span id="intent_parse" aria-hidden="true"></span>
<span id="成功与错误信封" aria-hidden="true"></span>
<span id="协议与远程调用" aria-hidden="true"></span>
<span id="完整-executor-回复" aria-hidden="true"></span>

## Parameter and protocol reference

See [Adapter API](/api/mcp#adapter-api), [tool input](/api/mcp#intent_parse), [envelopes](/api/mcp#success-and-error-envelopes), [protocols](/api/mcp#protocols-and-remote-calls), and [complete replies](/api/mcp#complete-executor-reply).
