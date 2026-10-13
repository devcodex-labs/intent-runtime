// Public contract: Usage Contract v0.7; success/baseline 2.0-draft.6.

export type JsonValue = null | string | number | boolean | JsonValue[] | JsonObject;
export type JsonObject = { [key: string]: JsonValue };

export type IntentOutputOptions = {
  suggestions?: boolean;
  evidence?: boolean;
  diagnostics?: boolean;
  extensions?: boolean;
};
export type IntentLimits = {
  maxInputBytes: number;
  maxContextBytes: number;
  maxBaselineBytes: number;
  maxSchemaBytes: number;
  maxRequestBytes: number;
  maxOutputBytes: number;
  maxDepth: number;
  maxConcurrentParses: number;
  maxValidationChecks: number;
};
export type IntentSchema = import('schema-dsl/pure').JSONSchema | import('schema-dsl/pure').ObjectDslBuilder;
export type IntentConfig = {
  language?: string;
  executor?: ModelExecutor;
  schema?: IntentSchema;
  extensionSchema?: IntentSchema;
  semantics?: BusinessSemantics;
  timeoutMs?: number;
  limits?: Partial<IntentLimits>;
  defaultOutput?: IntentOutputOptions;
};
export type IntentParseRequest = {
  input: string;
  fields?: readonly string[] | 'all';
  context?: object;
  baseline?: EffectiveIntentSnapshot;
  referenceTime?: string;
  output?: IntentOutputOptions;
};
export type IntentParseOptions = { signal?: AbortSignal };

export type BusinessSemantics = {
  domain?: string;
  description?: string;
  terms?: Array<{ name: string; meaning: string; aliases?: string[] }>;
  actions?: Array<{
    name: string;
    meaning: string;
    examples?: string[];
    counterExamples?: string[];
  }>;
};

export type IntentContractVersion = '2.0-draft.6';
export type SourceRef = {
  root: 'input' | 'context' | 'baseline' | 'schema' | 'extensionSchema' | 'semantics' | 'referenceTime';
  pointer: string;
  quote?: string;
};
export type ExpressionOperand =
  | { type: 'literal'; value: JsonValue }
  | { type: 'input'; intentId: string; path: string }
  | { type: 'source'; ref: SourceRef };
export type ConstraintScope =
  | { type: 'global' }
  | { type: 'intent' | 'phase'; intentId: string }
  | { type: 'target'; intentId: string; referenceId: string };
export type StructuredExpression =
  | { type: 'comparison'; left: ExpressionOperand; operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'; right: ExpressionOperand }
  | { type: 'all' | 'any'; items: StructuredExpression[] }
  | { type: 'not'; item: StructuredExpression };
export type IntentConstraint = {
  id: string;
  kind: 'requirement' | 'prohibition' | 'precondition' | 'preference';
  text: string;
  scope: ConstraintScope;
  expression?: StructuredExpression;
};
export type IntentReference = {
  id: string;
  kind: 'intent' | 'entity' | 'source';
  ref: string | null;
  resolved: boolean;
  description?: string;
  sourceRefs?: SourceRef[];
};
export type IntentRelation = {
  id: string;
  fromId: string;
  toId: string;
  kind: 'before' | 'depends_on' | 'parallel' | 'exclusive' | 'conditional';
  condition?: string;
};
export type StructuredIntent = {
  id: string;
  domain: string | null;
  action: string | null;
  target: string | null;
  goal: string;
  understanding: 'clear' | 'ambiguous' | 'incomplete' | 'conflicted';
  constraints: IntentConstraint[];
  inputs: JsonObject;
  optional?: boolean;
  expectedOutput?: string[];
  references: IntentReference[];
  children: StructuredIntent[];
  extensions: JsonObject;
};
export type ChangeTarget =
  | { kind: 'intent' | 'constraint' | 'relation'; id: string }
  | { kind: 'unresolved'; description: string };
export type IntentDelta =
  | { path: string; operation: 'set'; before?: JsonValue; after: JsonValue }
  | { path: string; operation: 'remove'; before?: JsonValue; after?: never };
export type IntentChangeBase = {
  operation: 'add' | 'modify' | 'withdraw' | 'confirm' | 'reject';
  target: ChangeTarget;
  description: string;
  sourceRefs: SourceRef[];
};
export type IntentChange = IntentChangeBase & (
  | { effect: 'applied'; deltas?: IntentDelta[]; conditionId?: never }
  | { effect: 'conditional'; conditionId: string; deltas?: never }
  | { effect: 'unresolved'; conditionId?: string; deltas?: never }
);
export type EffectiveIntentSnapshot = {
  schemaVersion: IntentContractVersion;
  coverage: 'complete' | 'partial' | 'unavailable';
  scope: 'current_request' | 'provided_materials';
  intents: StructuredIntent[];
  constraints: IntentConstraint[];
  unresolved: string[];
  relations: IntentRelation[];
};
export type TurnUnderstanding = {
  kind: 'request' | 'amendment' | 'confirmation' | 'rejection' | 'withdrawal' | 'answer' | 'statement' | 'mixed' | 'unclear';
  normalizedInput: string;
  intentIds: string[];
  changes: IntentChange[];
  facts: JsonObject;
};
export type FieldResult = {
  container: 'inputs' | 'facts' | 'extensions';
  intentId: string | null;
  field: string;
  path: string;
  trigger: 'selection' | 'invalidation';
  status: 'present' | 'explicit_null' | 'not_provided' | 'unknown' | 'not_applicable' | 'invalid' | 'invalidated' | 'removed';
  explanation?: string;
  rawText?: string;
  sourceRefs?: SourceRef[];
};
export type IntentCandidate = {
  id: string;
  description: string;
  intentId?: string;
  sourceRefs: SourceRef[];
};
export type IntentIssue = {
  container?: 'inputs' | 'facts' | 'extensions';
  id: string;
  code: string;
  category: 'ambiguity' | 'missing' | 'conflict' | 'data' | 'context';
  message: string;
  intentId?: string;
  field?: string;
  path?: string;
  sourceRefs?: SourceRef[];
  candidates?: IntentCandidate[];
  questions?: Array<{ question: string; optionIds?: string[] }>;
};
export type IntentInference = {
  target: string;
  candidate?: JsonValue;
  explanation: string;
  sourceRefs: SourceRef[];
};
export type IntentSuggestion = {
  kind: 'clarification' | 'semantic_improvement' | 'conflict_warning';
  text: string;
  relatesTo?: string[];
};
export type SourceEvidence = { target: string; sourceRefs: SourceRef[] };
export type IntentDiagnostics = { durationMs?: number; modelCallCount?: number };
export type IntentResult = {
  schemaVersion: IntentContractVersion;
  input: string;
  status: 'complete' | 'partial';
  turn: TurnUnderstanding;
  effective: EffectiveIntentSnapshot;
  fieldResults: FieldResult[];
  issues: IntentIssue[];
  inferences: IntentInference[];
  suggestions?: IntentSuggestion[];
  evidence?: SourceEvidence[];
  diagnostics?: IntentDiagnostics;
};


export type IntentErrorCode =
  | 'INPUT_INVALID' | 'CONFIG_INVALID' | 'FIELD_UNKNOWN'
  | 'SCHEMA_INVALID' | 'SCHEMA_NOT_CONFIGURED' | 'SCHEMA_UNSUPPORTED_FOR_EXTRACTION'
  | 'EXECUTOR_NOT_CONFIGURED' | 'MODEL_AUTH_FAILED' | 'MODEL_RATE_LIMITED'
  | 'MODEL_REQUEST_FAILED' | 'MODEL_REFUSED' | 'MODEL_OUTPUT_INCOMPLETE'
  | 'MODEL_OUTPUT_INVALID' | 'MODEL_TIMEOUT' | 'REQUEST_ABORTED'
  | 'INSTANCE_DISPOSED' | 'RESOURCE_LIMIT' | 'INTERNAL_PROCESSING_FAILED'
  | 'HOST_REQUEST_NOT_FOUND' | 'HOST_SUBMISSION_CONFLICT';
export type IntentErrorStage = 'config' | 'input' | 'model' | 'validation' | 'output' | 'transport';
export type CandidateViolationCode = 'STRUCTURE' | 'MISSING_REQUIRED' | 'TYPE_MISMATCH' | 'UNKNOWN_KEY' | 'DUPLICATE_ID' | 'REFERENCE_NOT_FOUND' | 'SOURCE_INVALID' | 'FIELD_OWNERSHIP' | 'SEMANTIC_INVARIANT';
export type CandidateViolation = { rule: CandidateViolationCode; path: string };
export type IntentErrorDetails = {
  path?: string;
  limit?: string;
  allowed?: number;
  observed?: number;
  unit?: 'bytes' | 'depth' | 'calls';
  violations?: CandidateViolation[];
};
export type IntentErrorOptions = {
  stage?: IntentErrorStage;
  details?: IntentErrorDetails;
  cause?: unknown;
};
export type ErrorSerializationOptions = { includePartialResult?: boolean };
export type SerializedIntentError = {
  name: 'IntentError';
  code: IntentErrorCode;
  message: string;
  stage: IntentErrorStage;
  details?: IntentErrorDetails;
  partialResult?: IntentResult;
};


export type ModelRequest = {
  instructions: string;
  input: JsonObject;
  outputSchema: object;
  signal: AbortSignal;
};
export type ModelReply =
  | { outcome: 'complete'; text: string }
  | { outcome: 'refusal' | 'incomplete'; reason?: string };
export interface ModelExecutor {
  readonly id: string;
  generate(request: ModelRequest): Promise<ModelReply>;
}
