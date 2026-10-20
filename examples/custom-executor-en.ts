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
