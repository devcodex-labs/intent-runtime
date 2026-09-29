import type {
  IntentRecord,
  IntentValidationIssue,
  IntentValidationResult
} from "./types.js";

const PRIORITIES = new Set(["low", "normal", "high", "critical"]);
const SOURCE_KINDS = new Set([
  "natural-language",
  "external-payload",
  "command",
  "event",
  "unknown"
]);

export function validateIntentRecord(record: unknown): IntentValidationResult {
  const issues: IntentValidationIssue[] = [];

  if (!isRecord(record)) {
    return {
      valid: false,
      issues: [
        {
          path: "$",
          code: "record.invalid",
          message: "Intent record must be an object.",
          severity: "error"
        }
      ]
    };
  }

  requireString(record, "schemaVersion", issues);
  if (record.schemaVersion !== "1.0") {
    issues.push(error("schemaVersion", "schema.unsupported", "schemaVersion must be 1.0."));
  }

  requireString(record, "intentId", issues);
  requireString(record, "action", issues);
  requireString(record, "summary", issues);
  requireString(record, "createdAt", issues);
  validateIsoDate(record.createdAt, "createdAt", issues);

  if (!isRecord(record.source)) {
    issues.push(error("source", "source.invalid", "source must be an object."));
  } else {
    requireString(record.source, "kind", issues, "source.kind");
    if (typeof record.source.kind === "string" && !SOURCE_KINDS.has(record.source.kind)) {
      issues.push(error("source.kind", "source.kind.unsupported", "source.kind is not supported."));
    }
    requireString(record.source, "receivedAt", issues, "source.receivedAt");
    validateIsoDate(record.source.receivedAt, "source.receivedAt", issues);
  }

  if (!Array.isArray(record.constraints)) {
    issues.push(error("constraints", "constraints.invalid", "constraints must be an array."));
  }

  if (!Array.isArray(record.trace) || record.trace.length === 0) {
    issues.push(error("trace", "trace.invalid", "trace must be a non-empty array."));
  }

  if (typeof record.priority !== "string" || !PRIORITIES.has(record.priority)) {
    issues.push(error("priority", "priority.invalid", "priority is not supported."));
  }

  if (typeof record.confidence !== "number" || Number.isNaN(record.confidence)) {
    issues.push(error("confidence", "confidence.invalid", "confidence must be a number."));
  } else if (record.confidence < 0 || record.confidence > 1) {
    issues.push(error("confidence", "confidence.range", "confidence must be between 0 and 1."));
  }

  if (!isRecord(record.metadata)) {
    issues.push(error("metadata", "metadata.invalid", "metadata must be an object."));
  }

  return {
    valid: issues.every((issue) => issue.severity !== "error"),
    issues
  };
}

export function assertValidIntentRecord(record: unknown): asserts record is IntentRecord {
  const result = validateIntentRecord(record);
  if (!result.valid) {
    const message = result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
    throw new TypeError(`Invalid intent record: ${message}`);
  }
}

function requireString(
  value: Record<string, unknown>,
  key: string,
  issues: IntentValidationIssue[],
  path = key
): void {
  if (typeof value[key] !== "string" || value[key].trim().length === 0) {
    issues.push(error(path, `${path}.required`, `${path} must be a non-empty string.`));
  }
}

function validateIsoDate(
  value: unknown,
  path: string,
  issues: IntentValidationIssue[]
): void {
  if (typeof value === "string" && Number.isNaN(Date.parse(value))) {
    issues.push(error(path, `${path}.date`, `${path} must be an ISO date string.`));
  }
}

function error(path: string, code: string, message: string): IntentValidationIssue {
  return {
    path,
    code,
    message,
    severity: "error"
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
