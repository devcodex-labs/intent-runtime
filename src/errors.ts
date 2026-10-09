import type { IntentResult } from "./contracts/public.js";
export const ERROR_CODES = Object.freeze([
  "CONFIG_INVALID",
  "SCHEMA_UNSUPPORTED",
  "INPUT_INVALID",
  "UNKNOWN_FIELD",
  "LIMIT_EXCEEDED",
  "EXECUTOR_NOT_CONFIGURED",
  "INSTANCE_DISPOSED",
  "MODEL_AUTH_FAILED",
  "MODEL_RATE_LIMITED",
  "MODEL_REQUEST_FAILED",
  "MODEL_TIMEOUT",
  "MODEL_ABORTED",
  "MODEL_REFUSED",
  "MODEL_OUTPUT_INCOMPLETE",
  "MODEL_OUTPUT_INVALID",
  "DATA_EXTRACTION_FAILED",
  "HOST_CAPABILITY_UNSUPPORTED",
  "BRIDGE_JOB_NOT_FOUND",
  "BRIDGE_JOB_EXPIRED",
  "BRIDGE_STEP_CONFLICT",
] as const);
export const DATA_ISSUE_CODES = Object.freeze([
  "DATA_REQUIRED_MISSING",
  "DATA_AMBIGUOUS",
  "DATA_CONFLICT",
  "DATA_CARDINALITY_MISMATCH",
  "DATA_VALUE_UNREPRESENTABLE",
  "DATA_CONSTRAINT_VIOLATED",
  "DATA_DEPENDENCY_MISSING",
  "DATA_DESCRIPTION_UNDETERMINED",
  "DATA_SOURCE_INVALID",
] as const);
export type ErrorCode = (typeof ERROR_CODES)[number];
export type DataIssueCode = (typeof DATA_ISSUE_CODES)[number];
export type ErrorStage = "config" | "input" | "core" | "data" | "bridge";
export type IssueCategory =
  | "input"
  | "config"
  | "business_information"
  | "definition"
  | "processing";
export interface IntentIssue {
  code: DataIssueCode | ErrorCode;
  category: IssueCategory;
  path: string | null;
  message: string;
}
export interface SerializedIntentError {
  code: ErrorCode;
  stage: ErrorStage;
  message: string;
  issues: IntentIssue[];
  partialResult?: IntentResult;
}
export class IntentParseError extends Error {
  readonly code: ErrorCode;
  readonly stage: ErrorStage;
  readonly issues: IntentIssue[];
  partialResult?: IntentResult;
  constructor(
    code: ErrorCode,
    stage: ErrorStage,
    message: string,
    issues: IntentIssue[] = [],
  ) {
    super(message);
    this.name = "IntentParseError";
    this.code = code;
    this.stage = stage;
    this.issues = issues;
  }
  toJSON(): SerializedIntentError {
    return {
      code: this.code,
      stage: this.stage,
      message: this.message,
      issues: this.issues,
      ...(this.partialResult ? { partialResult: this.partialResult } : {}),
    };
  }
}
export class IntentDataError extends IntentParseError {
  constructor(issues: IntentIssue[]) {
    super(
      "DATA_EXTRACTION_FAILED",
      "data",
      "Selected extension information cannot satisfy the definition.",
      issues,
    );
    this.name = "IntentDataError";
  }
}
export function fail(
  code: ErrorCode,
  stage: ErrorStage,
  message: string,
): never {
  throw new IntentParseError(code, stage, message);
}
export function asIntentError(
  error: unknown,
  stage: ErrorStage,
): IntentParseError {
  return error instanceof IntentParseError
    ? error
    : new IntentParseError(
        "MODEL_REQUEST_FAILED",
        stage,
        "Processing failed; no complete result was produced.",
      );
}
