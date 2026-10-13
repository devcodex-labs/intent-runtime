# Responses API

```js
import {createApiExecutor} from '@devcodex/intent-runtime/adapters/api';
const executor = createApiExecutor({provider: 'openai', model, apiKey});
```

| 配置 | 必填/默认 |
|---|---|
| provider | openai 或 xai |
| model / apiKey | 显式非空字符串，不进入模型材料或诊断 |
| baseURL | OpenAI: https://api.openai.com/v1；xAI: https://api.x.ai/v1；绝对 HTTP(S)，无用户凭据/query/fragment；非 TLS 仅本地/私网测试 |
| maxOutputTokens | 正安全整数，默认 8192 |
| maxResponseBytes | 正安全整数，默认 8388608 |
| format | json_schema 默认，或显式 text；不自动降级 |

适配器 POST `/responses`，store=false、stream=false、tools=[]。不发送隐式会话、previous_response_id 或业务工具。不重试、不切换供应商/模型。

HTTP 成功和失败 body 都有界读取。上限按 Response.body 可见字节累计，gzip 解压后计量，不依赖 Content-Length。恰好上限允许，超限取消读取与自有 fetch，报 RESOURCE_LIMIT/model。使用 fatal UTF-8；完成信封必须有唯一候选文本，不猜拼接。401/403 为认证，429 为限流，明确拒绝与 incomplete 保留区别。重定向不会转发凭据。

真实供应商对模型、Schema 与额度的接受性需单独验收。自定义非 Responses 协议使用 ModelExecutor，不能仅替换 baseURL 后宣称兼容。
