# 连接模型 API 与自有网关

<a id="配置模型来源"></a>

把你正在使用的模型接入 Intent Runtime。先确认服务提供哪一种协议，再选下面的接法；JavaScript 和 TypeScript 使用同一套运行时 API。第一次调用可直接按[快速开始](/zh/guide/quick-start)运行。

| 你已有的模型服务 | 推荐接法 | 是否需要自写执行器 |
|---|---|---|
| OpenAI / xAI Responses | createApiExecutor，默认 protocol=responses | 否 |
| 兼容 Responses 的自有网关 | 同上，设置 baseURL | 否 |
| 提供 /chat/completions 的兼容网关 | protocol=chat-completions，加 baseURL | 否 |
| 其他协议、已有模型 SDK、自定义鉴权头 | 用 ModelExecutor 连接现有调用 | 是，只适配模型调用 |
| Codex 当前模型 | [宿主模型路径](/zh/integrations/codex) | 不需要独立 API 凭据 |

“OpenAI 兼容”不一定表示兼容 Responses，请以服务实际提供的接口为准。INTENT_MODEL 与 INTENT_API_KEY 是应用示例读取的变量；库不会自动读取这些固定名称。

## OpenAI / xAI Responses API

```js
import {createApiExecutor} from '@devcodex/intent-runtime/adapters/api';
const executor = createApiExecutor({
  provider: 'openai',
  model: process.env.INTENT_MODEL,
  apiKey: process.env.INTENT_API_KEY,
});
```

model和apiKey必须事先配置为非空字符串。将executor传给new Intent。完整调用见[快速开始](/zh/guide/quick-start)；xAI改provider='xai'并使用对应凭据和模型。

## 连接自有网关

网关提供 `/v1/chat/completions` 时，将 API 根地址填到 baseURL，**不要再附上 /chat/completions**：

```js
const executor = createApiExecutor({
  provider: 'openai',
  protocol: 'chat-completions',
  baseURL: 'https://gateway.example.com/v1',
  apiKey: process.env.INTENT_API_KEY,
  model: process.env.INTENT_MODEL,
});
```

把域名、Key 和模型名替换为你已有服务的真实值。兼容 Responses 的网关将 protocol 改为 `responses` 即可。两者都将 executor 传入 `new Intent({executor})`，调用方式不变。`provider: 'openai'` 表示使用该兼容接口的供应商预设，配置 baseURL 后请求发往你的网关。

默认请求 JSON Schema 结构化输出；服务只支持普通文本时显式设置 `format: 'text'`，仍须返回符合任务要求的候选 JSON，由核心校验。format 不会切换接口协议，也不会自动重试另一种格式。

## 模型参数

| ApiExecutorConfig路径 | 类型 / 必填 | 默认 | 规则 |
|---|---|---|---|
| provider | openai或xai / 是 | 无 | 显式供应商 |
| protocol | responses或chat-completions / 否 | responses | 决定端点、请求和响应结构，不自动探测 |
| model | 非空string / 是 | 无 | 供应商接受的模型名 |
| apiKey | 非空string / 是 | 无 | 不进入模型材料/诊断 |
| baseURL | string / 否 | OpenAI：`https://api.openai.com/v1`；xAI：`https://api.x.ai/v1` | API根地址；绝对HTTP(S)，无用户凭据/query/fragment；非TLS仅本地/私网 |
| maxOutputTokens | 正安全整数 / 否 | 8192 | 本次生成上限 |
| maxResponseBytes | 正安全整数 / 否 | 8388608 | 每次HTTP响应可见body字节；与候选限制分别检查 |
| format | json_schema或text / 否 | json_schema | 显式选择，不自动降级 |

Responses 请求 `/responses`；Chat Completions 请求 `/chat/completions`。两者 store=false、stream=false，只发送本次识别材料，不发送业务工具或隐式历史，不重试、不切换模型。401/403为认证失败，429为限流；拒绝与输出未完成分别返回对应错误。具体错误恢复见[错误与恢复](/zh/api/errors)。

成功与失败body都按Response.body可见字节读取，gzip解压后计，不依赖Content-Length；恰好上限允许，超限终止读取并报RESOURCE_LIMIT/model。重定向不转发凭据。具体模型是否接受Schema和额度需在你的供应商环境确认，见[兼容范围](/zh/testing/validation)。

## 自定义 ModelExecutor

ModelExecutor 就是你提供的“调用模型”适配对象。你可以直接沿用现有 SDK 或 HTTP 调用，**不用另建一个网关服务**。

一次识别的流程：**用户文本 → Intent 整理任务 → 你的 generate 调用模型 → 返回候选 JSON 文本 → Intent 校验并生成最终结果**。

| Intent 传给 generate 的内容 | 你如何使用 |
|---|---|
| instructions | 放到模型的系统/任务指令中 |
| input | 作为模型输入材料，通常 JSON.stringify 后传入 |
| outputSchema | 交给模型 API 的结构化输出参数；协议不支持时，按该结构要求生成 JSON |
| signal | 传给 fetch 或支持取消的 SDK 调用 |

成功返回 `{outcome: 'complete', text: '模型生成的候选JSON'}`；模型拒绝或截断时返回 refusal / incomplete。**text 不是最终 IntentResult**，不用自己拼装结果。完整类型见[接口参考](/zh/api/intent#modelexecutor)。

下面用真实 Chat Completions 协议演示：在已有模型请求中增加应用请求头，再把 `choices[0].message.content` 转成 ModelReply。普通兼容网关优先用上面的内置适配器；需要其他协议时，修改请求和取回文本的部分。

<details>
<summary>完整 TypeScript 示例：自定义请求头与回复映射</summary>

<!-- example: examples/custom-executor.ts -->
```ts
import {Intent, IntentError} from '@devcodex/intent-runtime';
import type {ModelExecutor, ModelReply} from '@devcodex/intent-runtime';

// Example: adapt a real Chat Completions endpoint with an application header.
// For the standard protocol without custom headers, prefer createApiExecutor.
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
  const intent = new Intent({language: 'zh-CN', executor: createGatewayExecutor(url, model, apiKey)});
  try {console.log(await intent.parse({input: '分析支付模块，不修改文件'}));}
  finally {await intent.dispose();}
}

await main();
```

保存为ESM项目中的custom-executor.ts，设置INTENT_GATEWAY_URL、INTENT_MODEL、INTENT_API_KEY。已有TypeScript环境可直接编译；否则：

```bash
npm install -D typescript @types/node
npx tsc custom-executor.ts --outDir out --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck
node out/custom-executor.js
```

INTENT_GATEWAY_URL 填**完整调用地址**，例如 `https://gateway.example.com/v1/chat/completions`；该示例使用 fetch(url)，不会自动追加路径。项目 package.json 需有 `"type":"module"`。示例将 signal 传给本地 fetch，并限制响应大小；远端服务的取消机制按你已有协议处理。自行适配时保持候选输出格式，勿把业务执行混入识别调用。

</details>
