<span id="连接模型-api-与自有网关" aria-hidden="true"></span>

# Model APIs and gateways

The built-in OpenAI strict format distinguishes field issues (`category: data` and a field target) from semantic issues (no field target). The shared core still checks the real field owner, rule and references. It combines proof-backed redundant formal diagnoses while retaining semantic field problems and their clarification data. Custom executors, xAI, text mode and MCP host submissions use the shared candidate contract and the same core rules; they do not adopt OpenAI-only key or quote conventions.

Connect the model service you already use. First identify its protocol. JavaScript and TypeScript share the runtime API; the [quick start](/guide/quick-start) gives a complete first call.

| Your service | Recommended connection | Custom executor? |
|---|---|---|
| OpenAI / xAI Responses | createApiExecutor, default protocol=responses | No |
| Responses-compatible gateway | Same adapter with baseURL | No |
| Compatible /chat/completions gateway | protocol=chat-completions and baseURL | No |
| Other protocol, existing SDK, custom authentication headers | ModelExecutor wrapping your existing call | Adapt only model generation |
| Current Codex model | [Host mode](/integrations/codex) | No independent API credentials |

“OpenAI-compatible” does not necessarily include Responses. Check the service's actual endpoint. INTENT_MODEL and INTENT_API_KEY are variables the examples read; the library does not automatically read those names.

<span id="openai--xai-responses-api" aria-hidden="true"></span>
<span id="配置模型来源" aria-hidden="true"></span>

## OpenAI / xAI Responses

```js
import {createApiExecutor} from '@devcodex/intent-runtime/adapters/api';
const executor = createApiExecutor({
  provider: 'openai',
  model: process.env.INTENT_MODEL,
  apiKey: process.env.INTENT_API_KEY,
});
```

Configure model and apiKey as nonempty strings, then pass executor to new Intent. For xAI, use provider='xai' with its model and credentials.

<span id="连接自有网关" aria-hidden="true"></span>

## Connect your gateway

For a gateway exposing /v1/chat/completions, supply the **API root without /chat/completions**:

```js
const executor = createApiExecutor({
  provider: 'openai',
  protocol: 'chat-completions',
  baseURL: 'https://gateway.example.com/v1',
  apiKey: process.env.INTENT_API_KEY,
  model: process.env.INTENT_MODEL,
});
```

Replace the hostname, credentials, and model with your service's values. For a Responses-compatible gateway, set protocol='responses'. Pass executor to new Intent({executor}); parsing is unchanged. The openai provider selects a protocol preset; baseURL sends requests to your gateway.

JSON Schema structured output is the default. If the service only supports text output, set format='text' explicitly; it must still return candidate JSON matching the task for core validation. format does not switch protocols or automatically retry another format.

For provider='openai' and format='json_schema', both protocols send strict=true with an internal projection of the candidate Schema. Gateways must support OpenAI's strict subset; an unsupported gateway fails explicitly without automatic text fallback. xAI and explicit text mode keep their existing behavior.

The projection preserves required fields and rejects unsupported Schema shapes before any request with CONFIG_INVALID. Its private generation contract also constrains object identity, reference kinds and change states; the core still checks actual membership and semantic consistency. Registered SourceRef.quote fields are required on the wire. Current-input sources require the whole-input pointer and quote:null, restored to an omitted optional quote; this API path does not generate local input quotations. For other sources, null means omission, while an exact empty string or the string "null" remains a string. The reply is checked before this mapping; business nulls and JSON-encoded values are preserved. Duplicate JSON keys, missing fields, and unknown fields are rejected, without automatic repair. The unchanged core then checks sources, semantics, business rules, and the final result. Strict structure does not guarantee correct understanding. MCP host and custom executors retain their original source-quotation contract.

<span id="模型参数" aria-hidden="true"></span>

## Model parameters

| ApiExecutorConfig path | Type / required | Default | Rule |
|---|---|---|---|
| provider | openai or xai / yes | none | Explicit provider |
| protocol | responses or chat-completions / no | responses | Selects endpoint and request/reply structure; no autodetection |
| model | nonempty string / yes | none | Provider-supported model name |
| apiKey | nonempty string / yes | none | Excluded from model material and diagnostics |
| baseURL | string / no | OpenAI: https://api.openai.com/v1; xAI: https://api.x.ai/v1 | Absolute HTTP(S) API root; no credentials/query/fragment; plaintext http only for localhost/`*.localhost`, loopback (127.0.0.0/8, ::1, IPv4-mapped ::ffff:127.0.0.0/104), private (10/8, 172.16/12, 192.168/16, fc00::/7) and shared CGNAT 100.64/10 addresses; link-local 169.254/16 and fe80::/10 are rejected |
| maxOutputTokens | positive safe integer / no | 8192 | Generation limit |
| maxResponseBytes | positive safe integer / no | 8388608 | Visible HTTP response-body bytes; separate from candidate limits |
| format | json_schema or text / no | json_schema | Explicit choice without automatic fallback |

Responses uses /responses; Chat Completions uses /chat/completions. Both set store=false and stream=false, send only current recognition material, omit business tools and implicit history, and do not retry or switch models. 401/403 are authentication failures; 429 is rate limiting. Refusal and incomplete generation have distinct errors; see [Recovery](/api/errors).

Success and error bodies are bounded by bytes visible through Response.body after decompression, independently of Content-Length. Exactly the limit is allowed; exceeding it stops reading with RESOURCE_LIMIT/model. Redirects do not forward credentials. Check your actual provider's Schema support and quota; see [Compatibility](/testing/validation).

<span id="自定义-modelexecutor" aria-hidden="true"></span>

## Custom ModelExecutor

A ModelExecutor is your adapter for **calling the model**. Reuse an SDK or HTTP call; you do not need to build another gateway service.

The flow is: **user text → Intent prepares a task → your generate calls the model → candidate JSON text → Intent validates and assembles the final result**.

| generate receives | Your adapter does |
|---|---|
| instructions | Use as system/task instructions |
| input | Supply model material, usually JSON.stringify |
| outputSchema | Set structured output, or instruct unsupported protocols to generate JSON of this shape |
| signal | Forward to fetch or a cancellable SDK |

Return {outcome:'complete', text:'model-generated candidate JSON'} on success, or refusal/incomplete when appropriate. **text is not a final IntentResult**. Do not assemble the final result yourself. See [ModelExecutor](/api/intent#modelexecutor).

The following complete example adapts real Chat Completions with an application header and maps choices[0].message.content into ModelReply. Prefer the built-in adapter for the standard protocol; for another protocol, change the request and text extraction.

This custom executor demonstrates protocol adaptation and uses non-strict generation. It does not include the built-in adapter's private Schema projection or codec. Its caller must obtain conforming candidate JSON; do not turn strict on with the unchanged outputSchema. For standard OpenAI structured output, use createApiExecutor.

<details>
<summary>Complete TypeScript: custom headers and reply mapping</summary>

<!-- example: examples/custom-executor-en.ts -->
```ts
import {Intent, IntentError} from '@devcodex/intent-runtime';
import type {ModelExecutor, ModelReply} from '@devcodex/intent-runtime';

/**
 * Adapt Chat Completions with an application header using non-strict generation.
 * The caller must obtain conforming candidate JSON; this example does not include
 * the built-in OpenAI Schema projection/codec. Prefer createApiExecutor for the
 * standard protocol. Do not enable strict with the unchanged core outputSchema.
 */
export function createGatewayExecutor(url: string, model: string, apiKey: string): ModelExecutor {
  return {
    id: 'application-chat-gateway',
    async generate(request): Promise<ModelReply> {
      const response = await fetch(url, {
        method: 'POST', redirect: 'error', signal: request.signal,
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer ' + apiKey,
          'x-application': 'orders',
        },
        body: JSON.stringify({
          model,
          messages: [
            {role: 'system', content: request.instructions},
            {role: 'user', content: JSON.stringify(request.input)},
          ],
          response_format: {type: 'json_schema', json_schema: {
            name: 'intent_candidate', strict: false, schema: request.outputSchema,
          }},
          max_completion_tokens: 8192,
          stream: false,
          store: false,
        }),
      });
      const reply = await readReply(response);
      if (!reply || typeof reply !== 'object' || !('choices' in reply) || !Array.isArray(reply.choices) || reply.choices.length !== 1) throw new IntentError('MODEL_REQUEST_FAILED');
      const choice = reply.choices[0];
      if (!choice || typeof choice !== 'object' || !choice.message || choice.message.role !== 'assistant') throw new IntentError('MODEL_REQUEST_FAILED');
      if (choice.message.tool_calls?.length || choice.message.function_call) throw new IntentError('MODEL_REQUEST_FAILED');
      if (choice.finish_reason === 'length') return {outcome: 'incomplete'};
      if (choice.finish_reason === 'content_filter' || choice.message.refusal) return {outcome: 'refusal'};
      if (choice.finish_reason !== 'stop' || typeof choice.message.content !== 'string') throw new IntentError('MODEL_REQUEST_FAILED');
      return {outcome: 'complete', text: choice.message.content};
    },
  };
}

// Bound the visible response bytes, including error responses.
async function readReply(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    if (reader) for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 8388608) throw new IntentError('RESOURCE_LIMIT', {stage: 'model'});
      chunks.push(part.value);
    }
  } finally {
    if (reader) {await reader.cancel().catch(() => {}); reader.releaseLock();}
  }
  if (response.status === 401 || response.status === 403) throw new IntentError('MODEL_AUTH_FAILED');
  if (response.status === 429) throw new IntentError('MODEL_RATE_LIMITED');
  if (!response.ok) throw new IntentError('MODEL_REQUEST_FAILED');
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {body.set(chunk, offset); offset += chunk.byteLength;}
  return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(body));
}

export async function main(): Promise<void> {
  const {INTENT_GATEWAY_URL: url, INTENT_MODEL: model, INTENT_API_KEY: apiKey} = process.env;
  if (!url || !model || !apiKey) throw new Error('Set INTENT_GATEWAY_URL, INTENT_MODEL and INTENT_API_KEY.');
  const intent = new Intent({language: 'en', executor: createGatewayExecutor(url, model, apiKey)});
  try {console.log(await intent.parse({input: 'Analyze the payments module. Do not modify files.'}));}
  finally {await intent.dispose();}
}

await main();
```

Save as custom-executor-en.ts in an ESM project and set INTENT_GATEWAY_URL, INTENT_MODEL, INTENT_API_KEY. Use your TypeScript build, or:

```bash
npm install -D typescript @types/node
npx tsc custom-executor-en.ts --outDir out --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck
node out/custom-executor-en.js
```

INTENT_GATEWAY_URL is the **complete endpoint**, for example https://gateway.example.com/v1/chat/completions. This example calls fetch(url) and does not append a path. Set "type":"module" in package.json. It forwards signal to local fetch and bounds responses; remote cancellation follows your provider protocol. Preserve the candidate format and keep business execution outside recognition.

</details>
