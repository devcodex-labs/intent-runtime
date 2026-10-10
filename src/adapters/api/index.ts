import type {
  ModelExecutor,
  ModelReply,
  ModelRequest,
} from "../../contracts/public.js";
import { IntentParseError, fail } from "../../errors.js";
import { isObject, onlyKeys } from "../../internal/object.js";
export interface ApiExecutorConfig {
  provider: "openai" | "xai";
  apiKey: string;
  model: string;
  /** Explicit assertion about the selected model, after checking provider documentation. Defaults to strict-schema target. */
  nativeJsonSchema?: boolean;
  maxOutputTokens?: number;
  /** Explicit custom transport (e.g. a test fetch); credentials remain in the SDK only. */
  fetch?: typeof globalThis.fetch;
}
export function readCompletedResponse(
  response: unknown,
  request: ModelRequest,
): ModelReply {
  if (!isObject(response))
    fail(
      "MODEL_OUTPUT_INVALID",
      request.stage,
      "Provider returned no response object.",
    );
  if (response.status === "incomplete") return { outcome: "incomplete" };
  if (response.status !== "completed")
    fail(
      "MODEL_REQUEST_FAILED",
      request.stage,
      "Provider response did not complete.",
    );
  if (!Array.isArray(response.output))
    fail("MODEL_OUTPUT_INVALID", request.stage, "Provider output is missing.");
  const messages: string[] = [];
  for (const item of response.output) {
    if (!isObject(item))
      fail("MODEL_OUTPUT_INVALID", request.stage, "Malformed output item.");
    if (item.type === "reasoning") continue;
    if (
      item.type !== "message" ||
      item.role !== "assistant" ||
      !Array.isArray(item.content)
    )
      fail(
        "MODEL_OUTPUT_INVALID",
        request.stage,
        "Unexpected tool or non-assistant output.",
      );
    let text = "";
    for (const content of item.content) {
      if (!isObject(content))
        fail("MODEL_OUTPUT_INVALID", request.stage, "Malformed content.");
      if (content.type === "refusal") return { outcome: "refusal" };
      if (content.type !== "output_text" || typeof content.text !== "string")
        fail("MODEL_OUTPUT_INVALID", request.stage, "Unexpected content type.");
      text += content.text;
    }
    if (text) messages.push(text);
  }
  if (messages.length !== 1 || !messages[0]!.trim())
    fail(
      "MODEL_OUTPUT_INVALID",
      request.stage,
      "Expected one final nonempty candidate message.",
    );
  return { outcome: "complete", text: messages[0]! };
}
export function createApiExecutor(config: ApiExecutorConfig): ModelExecutor {
  if (!isObject(config))
    fail("CONFIG_INVALID", "config", "Expected API executor configuration.");
  onlyKeys(
    config,
    [
      "provider",
      "apiKey",
      "model",
      "nativeJsonSchema",
      "maxOutputTokens",
      "fetch",
    ],
    "config",
    "CONFIG_INVALID",
  );
  if (
    !isObject(config) ||
    !["openai", "xai"].includes(config.provider as string) ||
    typeof config.apiKey !== "string" ||
    !config.apiKey.trim() ||
    typeof config.model !== "string" ||
    !config.model.trim() ||
    (config.nativeJsonSchema !== undefined &&
      typeof config.nativeJsonSchema !== "boolean") ||
    (config.maxOutputTokens !== undefined &&
      (!Number.isSafeInteger(config.maxOutputTokens) ||
        (config.maxOutputTokens as number) <= 0)) ||
    (config.fetch !== undefined && typeof config.fetch !== "function")
  )
    fail(
      "CONFIG_INVALID",
      "config",
      "provider, apiKey and model must be explicitly configured.",
    );
  const provider = config.provider,
    model = config.model,
    apiKey = config.apiKey,
    nativeJsonSchema = config.nativeJsonSchema ?? true;
  const maxOutputTokens = config.maxOutputTokens ?? 8192;
  const fetchOverride = config.fetch;
  // Optional peer is loaded only when the API path is actually used.
  let clientPromise: Promise<import("openai").default> | undefined;
  let sdkTimeout: typeof import("openai").APIConnectionTimeoutError | undefined;
  function client(): Promise<import("openai").default> {
    clientPromise ??= import("openai")
      .then(
        ({ default: OpenAI, APIConnectionTimeoutError }) => {
          sdkTimeout = APIConnectionTimeoutError;
          return new OpenAI({
            apiKey,
            baseURL:
              provider === "openai"
                ? "https://api.openai.com/v1"
                : "https://api.x.ai/v1",
            maxRetries: 0,
            ...(fetchOverride ? { fetch: fetchOverride } : {}),
          });
        },
      )
      .catch(() => {
        fail(
          "CONFIG_INVALID",
          "config",
          "Install the optional openai SDK peer to use the API adapter.",
        );
      });
    return clientPromise;
  }
  return {
    id: "api:" + provider,
    capabilities: Object.freeze({
      nativeJsonSchema,
      nativeJsonObject: provider === "openai",
      isolatedTurn: true,
      supportsAbort: true,
    }),
    async generate(request): Promise<ModelReply> {
      if (request.format.kind === "json_schema" && !nativeJsonSchema)
        fail(
          "HOST_CAPABILITY_UNSUPPORTED",
          request.stage,
          "Selected model is not configured for strict JSON Schema.",
        );
      try {
        const sdk = await client();
        const format =
          request.format.kind === "json_schema"
            ? {
                type: "json_schema" as const,
                name: request.format.name,
                schema: request.format.schema,
                strict: true,
              }
            : provider === "openai"
              ? { type: "json_object" as const }
              : { type: "text" as const };
        const response = await sdk.responses.create(
          {
            model,
            store: false,
            stream: false,
            max_output_tokens: maxOutputTokens,
            tools: [],
            ...(provider === "openai"
              ? { instructions: request.instructions }
              : {}),
            input:
              provider === "xai"
                ? [
                    { role: "system", content: request.instructions },
                    { role: "user", content: request.payload },
                  ]
                : [{ role: "user", content: request.payload }],
            text: { format },
          },
          { signal: request.signal, maxRetries: 0 },
        );
        return readCompletedResponse(response, request);
      } catch (error) {
        if (error instanceof IntentParseError) throw error;
        if (request.signal.aborted) {
          if (request.signal.reason instanceof IntentParseError) throw request.signal.reason;
          throw new IntentParseError(
            request.signal.reason instanceof Error && request.signal.reason.name === "TimeoutError" ? "MODEL_TIMEOUT" : "MODEL_ABORTED",
            request.stage,
            "Model request aborted by its caller.",
          );
        }
        if (sdkTimeout && error instanceof sdkTimeout)
          throw new IntentParseError("MODEL_TIMEOUT", request.stage, "Provider request timed out.");
        const status =
          isObject(error) || error instanceof Error
            ? (error as { status?: number }).status
            : undefined;
        throw new IntentParseError(
          status === 401 || status === 403
            ? "MODEL_AUTH_FAILED"
            : status === 429
              ? "MODEL_RATE_LIMITED"
              : "MODEL_REQUEST_FAILED",
          request.stage,
          "Provider request failed; credentials and raw provider diagnostics are omitted.",
        );
      }
    },
  };
}
