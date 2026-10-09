import type { JSONSchema } from "schema-dsl/pure";
export type { JSONSchema };
export const ACTIONS = Object.freeze([
  "query",
  "analyze",
  "generate",
  "modify",
  "delete",
  "execute",
  "other",
] as const);
export const STATUSES = Object.freeze([
  "ready",
  "needs_clarification",
  "awaiting_confirmation",
  "conditional",
] as const);
export type IntentAction = (typeof ACTIONS)[number];
export type IntentStatus = (typeof STATUSES)[number];
export type JsonValue =
  | null
  | string
  | number
  | boolean
  | JsonValue[]
  | { [key: string]: JsonValue };
export interface Clarification {
  question: string;
  options: string[];
}
interface ItemBase {
  id: string;
  target: string | null;
  requirements: string[];
}
export type IntentItem = ItemBase &
  (
    | {
        action: IntentAction;
        status: "ready";
        reason?: never;
        clarification?: never;
      }
    | {
        action: IntentAction | null;
        status: "needs_clarification";
        reason: string;
        clarification: [Clarification, ...Clarification[]];
      }
    | {
        action: IntentAction;
        status: "awaiting_confirmation" | "conditional";
        reason: string;
        clarification?: never;
      }
  );
export interface IntentResult {
  input: string;
  normalizedInput: string;
  primaryIntent: string | null;
  requirements: string[];
  intents: IntentItem[];
  prohibitions: string[];
  data: Record<string, JsonValue>;
}
export interface ContextMessage {
  role: "user" | "assistant" | "tool";
  content: string;
}
export type IntentContext = string | readonly ContextMessage[];
export interface IntentParseRequest {
  input: string;
  fields?: readonly string[];
  context?: IntentContext;
}
export interface ModelRequest {
  stage: "core" | "data";
  instructions: string;
  payload: string;
  format:
    | { kind: "json_schema"; name: string; schema: JSONSchema }
    | { kind: "json_object" };
  signal: AbortSignal;
}
export type ModelReply =
  | { outcome: "complete"; text: string }
  | { outcome: "refusal" | "incomplete"; detail?: string };
export interface ExecutorCapabilities {
  nativeJsonSchema: boolean;
  nativeJsonObject: boolean;
  isolatedTurn: boolean;
  supportsAbort: boolean;
}
export interface ModelExecutor {
  readonly id: string;
  readonly capabilities: ExecutorCapabilities;
  generate(request: ModelRequest): Promise<ModelReply>;
}
export interface IntentLimits {
  maxInputBytes: number;
  maxContextBytes: number;
  maxSchemaBytes: number;
  maxRequestBytes: number;
  maxOutputBytes: number;
  maxSchemaDepth: number;
  maxSchemaProperties: number;
  maxContextMessages: number;
  maxIntentCount: number;
  maxConcurrentParses: number;
  maxSchemaCacheEntries: number;
  maxCandidateDepth: number;
  maxCandidateNodes: number;
  maxEvidenceEntries: number;
  maxIssueCount: number;
  maxValidationMs: number;
  maxValidationQueueEntries: number;
}
export interface IntentConfig {
  language?: string;
  schema?: JSONSchema;
  executor?: ModelExecutor;
  timeoutMs?: number;
  repairAttempts?: 0 | 1;
  limits?: Partial<IntentLimits>;
}
export const DEFAULT_LIMITS: Readonly<IntentLimits> = Object.freeze({
  maxInputBytes: 65536,
  maxContextBytes: 131072,
  maxSchemaBytes: 131072,
  maxRequestBytes: 524288,
  maxOutputBytes: 262144,
  maxSchemaDepth: 8,
  maxSchemaProperties: 256,
  maxContextMessages: 100,
  maxIntentCount: 100,
  maxConcurrentParses: 4,
  maxSchemaCacheEntries: 128,
  maxCandidateDepth: 32,
  maxCandidateNodes: 20000,
  maxEvidenceEntries: 4096,
  maxIssueCount: 256,
  maxValidationMs: 1000,
  maxValidationQueueEntries: 32,
});
