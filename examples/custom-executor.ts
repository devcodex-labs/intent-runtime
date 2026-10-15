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
