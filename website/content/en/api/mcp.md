<span id="mcp-工具与协议参考" aria-hidden="true"></span>

# MCP tools and protocol

Reference for adapter parameters, tools, host handoffs, envelopes, and protocol boundaries. For first connection use the [stdio / HTTP guide](/integrations/mcp); for embedding use [Extend a server](/integrations/mcp-sdk).

Standalone configuration instances contains IntentConfig; adapter instances contains caller-created Intent objects. They are not interchangeable. Every path shares the recognition core and IntentResult.

## Adapter API

```ts
createIntentMcpAdapter(config: IntentMcpAdapterConfig): IntentMcpAdapter
adapter.tools: readonly IntentMcpToolDefinition[]
adapter.connect(options: IntentMcpConnectOptions): IntentMcpSession
adapter.close(): Promise<void>
session.callTool(name: string, args: unknown, options?: IntentParseOptions): Promise<IntentMcpToolResult | undefined>
session.close(): Promise<void>
```

| Parameter | Type / default | Behavior |
|---|---|---|
| config.mode | executor or host / executor | Executor mode requires an executor for each instance |
| config.instances | Record&lt;string, Intent&gt; / required | Nonempty caller-created instances, not standalone config objects |
| config.toolPrefix | string / empty | Avoid original tool collisions; check before registration |
| connect.protocolVersion | Declared version / required | SDK-negotiated version, not input/context |
| callTool.args.instance | string / auto-select a single instance | Required with multiple instances; no guessed default |
| callTool.options.signal | AbortSignal / optional | Protocol cancellation, outside tool JSON |

Instance names use 1–64 characters [A-Za-z0-9_.-]; __proto__/prototype/constructor are forbidden. Prefixes use the same alphabet and may be empty. Invalid connection configuration produces CONFIG_INVALID/transport. Disposed instances cannot start new recognition.

Unknown tools return exactly undefined for your original router. session.close ends its recognition and retained records; adapter.close closes owned sessions. Neither disposes borrowed Intent objects nor closes external SDKs, transports, or shared models. Close at logical connection end; do not recreate host sessions for each tool call or share one session across clients/tenants.

<span id="宿主交接" aria-hidden="true"></span>

## Host handoff

| Tool | Input | Successful result |
|---|---|---|
| intent_prepare | Native request plus optional instance | HostTask: kind=model_task, requestId, submissionToken, instructions, input, outputSchema |
| intent_accept | requestId, submissionToken, complete candidateText string | IntentResult |
| intent_cancel | requestId; optional reason=cancelled/refusal/incomplete | requestId, status=cancelled/already_cancelled/already_completed |

The current model follows HostTask material and outputSchema, not a guessed final Result shape. The server makes no extra model call. The bundled Skill allows at most one format correction from explicit feedback. Missing information or indeterminate fields do not trigger format correction. Cancel when unable to complete; use refusal/incomplete for those outcomes.

Concurrent submissions with the same token and byte-identical candidate share validation; retained completed replies can replay. A different candidate conflicts. Explicit correction does not reset the validation budget. Default recognition has no deadline; explicit timeout starts at prepare. Terminal replies are bounded to 32 records/8 MiB per adapter. Closed sessions, restarted processes, or reclaimed records require new prepare. These records are not durable business storage.

## intent_parse

Executor mode exposes only intent_parse. Input contains Native input/fields/context/baseline/referenceTime/output plus instance. See [Native API](/api/intent) for defaults and errors. MCP callers cannot provide schema, executor, apiKey, signal, config paths, or mode.

With a single main instance, instance may be omitted. After SDK negotiation:

<!-- json: executor-request -->
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "intent_parse",
    "arguments": {
      "input": "Look up order 000123. Do not cancel the order."
    }
  }
}
```

No Schema is configured here, so no orderId field is selected. structuredContent has the full IntentResult shape from the <a href="/intent-runtime/examples/en/basic-example.json" download target="_blank" rel="noopener noreferrer">no-Schema example</a>; content[0].text serializes that same object and isError=false. This is not a reduced response format. Add a Schema to trusted instance configuration before selecting fields.

See [Host handoff](#host-handoff) and [Types](/api/types).

<span id="成功与错误信封" aria-hidden="true"></span>

## Success and error envelopes

| Case | isError | structuredContent | content text |
|---|---|---|---|
| Complete/partial intent, missing fields, ambiguity | false | IntentResult | Same JSON |
| Host prepare | false | HostTask | Same JSON |
| Host cancel | false | HostCancelReply | Same JSON |
| Technical failure | true | omitted | JSON string of {error: SerializedIntentError} |

Technical failures omit partialResult. The SDK handles unknown standard methods or invalid JSON-RPC using protocol errors rather than inventing IntentResult.

<span id="协议与远程调用" aria-hidden="true"></span>

## Protocols and remote calls

Declared targets are 2025-06-18, 2025-11-25, and 2026-07-28. The first two successful envelopes use content/structuredContent/isError; 2026 tool replies also include resultType=complete. A compatible SDK handles negotiation, discovery, and envelopes. Tool arguments do not select the protocol.

Standalone --transport http --host 127.0.0.1 --port 3001 --path /mcp uses stateful Streamable HTTP with the two 2025 versions. stdio supports all three. See [HTTP setup](/integrations/mcp#http-and-a-custom-port).

--public-origin declares the public HTTP/HTTPS origin independently of binding; no credentials, wildcard domains, path, query, or fragment. Wildcard bindings 0.0.0.0/:: require it. Public Host and Origin match the configured origin exactly; local diagnostics remain allowed. Arbitrary forwarded headers are not trusted. See [remote deployment](/integrations/mcp#remote-addresses-and-https-proxies).

Existing HTTP SDK servers can use the same tool-list/call forwarding. The server owns authentication, listening, and reconnect behavior. A brief HTTP stream interruption does not itself close a retained logical session. Creating a host session per HTTP request breaks prepare/accept continuity. Validate your actual client, proxy, and authentication deployment.

<span id="完整-executor-回复" aria-hidden="true"></span>

## Complete executor reply

This is the result body of tools/call, without outer jsonrpc/id. It is generated through the actual adapter/core with a controlled language candidate, not promised verbatim real-model output.

<a href="/intent-runtime/examples/en/executor-request.json" download target="_blank" rel="noopener noreferrer">Standard request</a> · <a href="/intent-runtime/examples/en/executor-result.json" download target="_blank" rel="noopener noreferrer">Complete tool reply</a>

<details>
<summary>Expand the complete reply</summary>

<!-- json: executor-result -->
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"schemaVersion\":\"2.0-draft.6\",\"input\":\"Look up order 000123. Do not cancel the order.\",\"status\":\"complete\",\"turn\":{\"kind\":\"request\",\"normalizedInput\":\"Look up order 000123. Do not cancel the order.\",\"intentIds\":[\"intent-1\"],\"changes\":[{\"operation\":\"add\",\"target\":{\"kind\":\"intent\",\"id\":\"intent-1\"},\"description\":\"Add the explicit request from this turn\",\"sourceRefs\":[{\"root\":\"input\",\"pointer\":\"\"}],\"effect\":\"applied\"},{\"operation\":\"add\",\"target\":{\"kind\":\"constraint\",\"id\":\"constraint-1\"},\"description\":\"Add the explicit request from this turn\",\"sourceRefs\":[{\"root\":\"input\",\"pointer\":\"\"}],\"effect\":\"applied\"}],\"facts\":{}},\"effective\":{\"schemaVersion\":\"2.0-draft.6\",\"coverage\":\"complete\",\"scope\":\"current_request\",\"intents\":[{\"id\":\"intent-1\",\"domain\":null,\"action\":\"Look up\",\"target\":\"order 000123\",\"goal\":\"Look up order 000123\",\"understanding\":\"clear\",\"constraints\":[{\"id\":\"constraint-1\",\"kind\":\"prohibition\",\"text\":\"Do not cancel the order\",\"scope\":{\"type\":\"intent\",\"intentId\":\"intent-1\"}}],\"inputs\":{},\"references\":[],\"children\":[],\"extensions\":{}}],\"constraints\":[],\"relations\":[],\"unresolved\":[]},\"fieldResults\":[],\"issues\":[],\"inferences\":[]}"
    }
  ],
  "structuredContent": {
    "schemaVersion": "2.0-draft.6",
    "input": "Look up order 000123. Do not cancel the order.",
    "status": "complete",
    "turn": {
      "kind": "request",
      "normalizedInput": "Look up order 000123. Do not cancel the order.",
      "intentIds": [
        "intent-1"
      ],
      "changes": [
        {
          "operation": "add",
          "target": {
            "kind": "intent",
            "id": "intent-1"
          },
          "description": "Add the explicit request from this turn",
          "sourceRefs": [
            {
              "root": "input",
              "pointer": ""
            }
          ],
          "effect": "applied"
        },
        {
          "operation": "add",
          "target": {
            "kind": "constraint",
            "id": "constraint-1"
          },
          "description": "Add the explicit request from this turn",
          "sourceRefs": [
            {
              "root": "input",
              "pointer": ""
            }
          ],
          "effect": "applied"
        }
      ],
      "facts": {}
    },
    "effective": {
      "schemaVersion": "2.0-draft.6",
      "coverage": "complete",
      "scope": "current_request",
      "intents": [
        {
          "id": "intent-1",
          "domain": null,
          "action": "Look up",
          "target": "order 000123",
          "goal": "Look up order 000123",
          "understanding": "clear",
          "constraints": [
            {
              "id": "constraint-1",
              "kind": "prohibition",
              "text": "Do not cancel the order",
              "scope": {
                "type": "intent",
                "intentId": "intent-1"
              }
            }
          ],
          "inputs": {},
          "references": [],
          "children": [],
          "extensions": {}
        }
      ],
      "constraints": [],
      "relations": [],
      "unresolved": []
    },
    "fieldResults": [],
    "issues": [],
    "inferences": []
  },
  "isError": false
}
```

</details>
