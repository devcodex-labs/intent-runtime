# 配置模型来源

Node调用和executor模式MCP需要显式ModelExecutor。你可以使用内置OpenAI/xAI Responses API，也可以接入已有模型网关。Codex复用当前模型时使用[host路径](/integrations/codex)，不把宿主交接暗中替换成API。

## OpenAI / xAI Responses API

```js
import {createApiExecutor} from '@devcodex/intent-runtime/adapters/api';
const executor = createApiExecutor({
  provider: 'openai',
  model: process.env.INTENT_MODEL,
  apiKey: process.env.INTENT_API_KEY,
});
```

model和apiKey必须事先配置为非空字符串。将executor传给new Intent。完整调用见[快速开始](/guide/quick-start)；xAI改provider='xai'并使用对应凭据和模型。

| ApiExecutorConfig路径 | 类型 / 必填 | 默认 | 规则 |
|---|---|---|---|
| provider | openai或xai / 是 | 无 | 显式供应商 |
| model | 非空string / 是 | 无 | 供应商接受的模型名 |
| apiKey | 非空string / 是 | 无 | 不进入模型材料/诊断 |
| baseURL | string / 否 | OpenAI https://api.openai.com/v1；xAI https://api.x.ai/v1 | 绝对HTTP(S)，无用户凭据/query/fragment；非TLS仅本地/私网 |
| maxOutputTokens | 正安全整数 / 否 | 8192 | 本次生成上限 |
| maxResponseBytes | 正安全整数 / 否 | 8388608 | 每次HTTP响应可见body字节；与候选限制分别检查 |
| format | json_schema或text / 否 | json_schema | 显式选择，不自动降级 |

适配器POST `/responses`，store=false、stream=false、tools=[]。不发送隐式历史、previous_response_id或业务工具，不重试、不换供应商/模型。401/403映射认证错误，429映射限流，refusal/incomplete分别保留。

成功与失败body都按Response.body可见字节读取，gzip解压后计，不依赖Content-Length；恰好上限允许，超限终止读取并报RESOURCE_LIMIT/model。重定向不转发凭据。具体模型是否接受Schema和额度需在你的供应商环境确认，见[兼容范围](/testing/validation)。

## 自定义 ModelExecutor

非Responses协议不能只替换baseURL。按[ModelExecutor接口](/api/intent#modelexecutor)调用你的模型，返回一份候选文本。下面定义一个示例网关协议：请求为model/instructions/input/outputSchema，回复为 `{outcome:'complete',text:'候选JSON'}`，或refusal/incomplete。你的网关需实现或转换该协议；它不是库自动提供的HTTP服务。

<!-- example: examples/custom-executor.ts -->
```ts
import {Intent, IntentError} from '@devcodex/intent-runtime';
import type {ModelExecutor, ModelReply} from '@devcodex/intent-runtime';

// The caller's gateway must accept this JSON request and return ModelReply.
export function createGatewayExecutor(url: string, model: string, apiKey: string): ModelExecutor {
  return {
    id: 'application-gateway',
    async generate(request): Promise<ModelReply> {
      const response = await fetch(url, {
        method: 'POST', signal: request.signal,
        headers: {'content-type': 'application/json', authorization: 'Bearer ' + apiKey},
        body: JSON.stringify({model, instructions: request.instructions, input: request.input, outputSchema: request.outputSchema}),
      });
      if (response.status === 401 || response.status === 403) throw new IntentError('MODEL_AUTH_FAILED');
      if (response.status === 429) throw new IntentError('MODEL_RATE_LIMITED');
      if (!response.ok) throw new IntentError('MODEL_REQUEST_FAILED');
      const reply: unknown = await response.json();
      if (!reply || typeof reply !== 'object' || !('outcome' in reply)) throw new IntentError('MODEL_REQUEST_FAILED');
      if (reply.outcome === 'complete' && 'text' in reply && typeof reply.text === 'string') return {outcome: 'complete', text: reply.text};
      if (reply.outcome === 'refusal' || reply.outcome === 'incomplete') return {outcome: reply.outcome};
      throw new IntentError('MODEL_REQUEST_FAILED');
    },
  };
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

项目package.json需有 `"type":"module"`。网关必须响应同一signal，不附加隐藏历史、外查或业务执行；生成的是任务要求的候选，不是最终IntentResult。按你的网关需要控制响应体大小、错误与凭据。示例的类型检查不等于你的真实网关或供应商已经验证。
