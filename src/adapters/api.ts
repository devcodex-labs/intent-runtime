import type { ModelExecutor, ModelReply, ModelRequest } from '../contracts/public.js';
import { IntentError } from '../contracts/errors.js';
import { plain, cloneJson } from '../internal/json.js';
import { compileOpenAiOutput, OPENAI_WIRE_INSTRUCTIONS, type OpenAiOutput } from './openai-schema.js';

export type ApiExecutorConfig = {
  provider: 'openai' | 'xai'; model: string; apiKey: string; baseURL?: string;
  protocol?: 'responses' | 'chat-completions';
  maxOutputTokens?: number; maxResponseBytes?: number; format?: 'json_schema' | 'text';
};

// No SDK state, implicit history, retries or business tools. Configuration is
// trusted application input and is captured before any asynchronous operation.
export function createApiExecutor(config: ApiExecutorConfig): ModelExecutor {
  const invalid = (): never => {throw new IntentError('CONFIG_INVALID');};
  if (!plain(config)) invalid();
  const allowed = new Set(['provider', 'model', 'apiKey', 'baseURL', 'protocol', 'maxOutputTokens', 'maxResponseBytes', 'format']);
  const data: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(config)) {
    const d = Object.getOwnPropertyDescriptor(config, key);
    if (typeof key !== 'string' || !allowed.has(key) || !d || !('value' in d) || !d.enumerable) return invalid();
    if (d.value !== undefined) data[key] = d.value;
  }
  if (typeof data.provider !== 'string' || !['openai', 'xai'].includes(data.provider) || typeof data.model !== 'string' || !data.model.trim() || typeof data.apiKey !== 'string' || !data.apiKey.trim() || data.baseURL !== undefined && typeof data.baseURL !== 'string') invalid();
  const provider = data.provider as ApiExecutorConfig['provider'], model = data.model as string, apiKey = data.apiKey as string;
  const maxOutputTokens = data.maxOutputTokens ?? 8192, maxResponseBytes = data.maxResponseBytes ?? 8388608, format = data.format ?? 'json_schema';
  const protocol = data.protocol ?? 'responses';
  if (protocol !== 'responses' && protocol !== 'chat-completions') invalid();
  if (!Number.isSafeInteger(maxOutputTokens) || (maxOutputTokens as number) <= 0 || !Number.isSafeInteger(maxResponseBytes) || (maxResponseBytes as number) <= 0 || typeof format !== 'string' || !['json_schema', 'text'].includes(format)) invalid();
  let base: URL;
  try {base = new URL(data.baseURL === undefined ? provider === 'openai' ? 'https://api.openai.com/v1' : 'https://api.x.ai/v1' : data.baseURL as string);} catch {return invalid();}
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) invalid();
  if (base.protocol === 'http:' && !localAddress(base.hostname)) invalid();
  const url = base.href.replace(/\/$/, '') + (protocol === 'responses' ? '/responses' : '/chat/completions');
  return Object.freeze({id: provider + ':' + protocol, async generate(request: ModelRequest): Promise<ModelReply> {
    const owner = new AbortController();
    const cancel = () => owner.abort(request.signal.reason);
    request.signal.addEventListener('abort', cancel, {once: true});
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let output: OpenAiOutput | undefined;
    try {
      if (request.signal.aborted) throw new IntentError('REQUEST_ABORTED');
      if (provider === 'openai' && format === 'json_schema') output = compileOpenAiOutput(request.outputSchema);
      const instructions = request.instructions + (output ? OPENAI_WIRE_INSTRUCTIONS : '');
      const schema = output?.schema ?? request.outputSchema;
      const response = await fetch(url, {method: 'POST', redirect: 'error', signal: owner.signal,
        headers: {'content-type': 'application/json', authorization: 'Bearer ' + apiKey},
        body: JSON.stringify(protocol === 'chat-completions' ? {
          model, messages: [{role: 'system', content: instructions}, {role: 'user', content: JSON.stringify(request.input)}],
          store: false, stream: false, max_completion_tokens: maxOutputTokens,
          ...(format === 'json_schema' ? {response_format: {type: 'json_schema', json_schema: {name: 'intent_candidate', strict: !!output, schema: cloneJson(schema)}}} : {}),
        } : {model, instructions, input: [{role: 'user', content: [{type: 'input_text', text: JSON.stringify(request.input)}]}],
          tools: [], store: false, stream: false, max_output_tokens: maxOutputTokens,
          ...(format === 'json_schema' ? {text: {format: {type: 'json_schema', name: 'intent_candidate', strict: !!output, schema: cloneJson(schema)}}} : {text: {format: {type: 'text'}}})})});
      // Status is retained even for no-body authentication responses. All
      // status classes use the same bounded reader before error classification.
      const status = response.status, chunks: Uint8Array[] = [];
      const slabSize = Math.min(65536, maxResponseBytes as number); let slab: Uint8Array | undefined, offset = 0, bytes = 0;
      if (response.body) {
        reader = response.body.getReader();
        for (;;) {
          const part = await reader.read();
          if (owner.signal.aborted) throw new IntentError('REQUEST_ABORTED');
          if (part.done) break;
          const chunk = part.value;
          if (chunk.byteLength > (maxResponseBytes as number) - bytes) {
            const error = new IntentError('RESOURCE_LIMIT', {stage: 'model', details: {limit: 'maxResponseBytes', allowed: maxResponseBytes as number, observed: bytes + chunk.byteLength, unit: 'bytes'}});
            owner.abort(error); await reader.cancel().catch(() => {}); throw error;
          }
          bytes += chunk.byteLength;
          for (let at = 0; at < chunk.byteLength;) {
            slab ??= new Uint8Array(slabSize);
            const n = Math.min(slab.length - offset, chunk.byteLength - at); slab.set(chunk.subarray(at, at + n), offset); offset += n; at += n;
            if (offset === slab.length) {chunks.push(slab); slab = undefined; offset = 0;}
          }
        }
      }
      if (request.signal.aborted) throw new IntentError('REQUEST_ABORTED');
      if (status === 401 || status === 403) throw new IntentError('MODEL_AUTH_FAILED');
      if (status === 429) throw new IntentError('MODEL_RATE_LIMITED');
      if (status < 200 || status >= 300) throw new IntentError('MODEL_REQUEST_FAILED');
      const body = new Uint8Array(bytes); let at = 0;
      for (const chunk of chunks) {body.set(chunk, at); at += chunk.length;}
      if (slab) body.set(slab.subarray(0, offset), at);
      let envelope: unknown;
      try {envelope = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(body));} catch {throw new IntentError('MODEL_REQUEST_FAILED');}
      const reply = protocol === 'responses' ? responseReply(envelope) : chatReply(envelope);
      if (output && reply.outcome === 'complete') {
        if (request.signal.aborted) throw new IntentError('REQUEST_ABORTED');
        const text = output.decode(reply.text);
        if (request.signal.aborted) throw new IntentError('REQUEST_ABORTED');
        return {outcome: 'complete', text};
      }
      return reply;
    } catch (cause) {
      if (cause instanceof IntentError) throw cause;
      if (request.signal.aborted) throw new IntentError('REQUEST_ABORTED');
      throw new IntentError('MODEL_REQUEST_FAILED');
    } finally {
      output?.close();
      request.signal.removeEventListener('abort', cancel);
      if (reader) {await reader.cancel().catch(() => {}); reader.releaseLock();}
    }
  }});
}

function localAddress(host: string): boolean {
  if (host === 'localhost' || host === '[::1]' || host.endsWith('.localhost')) return true;
  if (/^\[f[cd][0-9a-f]{2}:/.test(host) || /^\[fe[89ab][0-9a-f]:/.test(host)) return true;
  const parts = host.split('.').map(Number);
  return parts.length === 4 && parts.every(n => Number.isInteger(n) && n >= 0 && n <= 255) && (parts[0] === 127 || parts[0] === 10 || parts[0] === 192 && parts[1] === 168 || parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31);
}
function responseReply(value: unknown): ModelReply {
  const failed = (): never => {throw new IntentError('MODEL_REQUEST_FAILED');};
  if (!plain(value) || typeof value.status !== 'string' || !Array.isArray(value.output)) return failed();
  if (value.status === 'incomplete') return {outcome: 'incomplete'};
  if (value.status !== 'completed') return failed();
  const texts: string[] = []; let refusal = false;
  for (const item of value.output) {
    if (!plain(item)) return failed();
    if (item.type === 'reasoning') continue;
    if (item.type !== 'message' || item.role !== 'assistant' || !Array.isArray(item.content)) return failed();
    for (const part of item.content) {
      if (!plain(part)) return failed();
      if (part.type === 'refusal' && typeof part.refusal === 'string') refusal = true;
      else if (part.type === 'output_text' && typeof part.text === 'string') texts.push(part.text);
      else return failed();
    }
  }
  if (refusal) return {outcome: 'refusal'};
  if (texts.length !== 1) return failed();
  return {outcome: 'complete', text: texts[0]!};
}

function chatReply(value: unknown): ModelReply {
  const failed = (): never => {throw new IntentError('MODEL_REQUEST_FAILED');};
  if (!plain(value) || !Array.isArray(value.choices) || value.choices.length !== 1) return failed();
  const choice: unknown = value.choices[0];
  if (!plain(choice) || !plain(choice.message) || choice.message.role !== 'assistant') return failed();
  const message = choice.message;
  if (message.tool_calls !== undefined && (!Array.isArray(message.tool_calls) || message.tool_calls.length > 0) || message.function_call != null) return failed();
  if (choice.finish_reason === 'content_filter') return {outcome: 'refusal'};
  if (choice.finish_reason === 'length') return {outcome: 'incomplete'};
  if (choice.finish_reason !== 'stop') return failed();
  if (typeof message.refusal === 'string' && message.refusal.length > 0) return {outcome: 'refusal'};
  if (message.refusal != null && typeof message.refusal !== 'string' || typeof message.content !== 'string') return failed();
  return {outcome: 'complete', text: message.content};
}
