export type IntentRecordVersion = "1.0";

export type IntentInputKind =
  | "natural-language"
  | "external-payload"
  | "command"
  | "event"
  | "unknown";

export type IntentPriority = "low" | "normal" | "high" | "critical";

export type IntentValidationSeverity = "error" | "warning";

export type IntentTraceStage =
  | "received"
  | "parsed"
  | "normalized"
  | "validated"
  | "enriched";

export interface IntentSource {
  readonly kind: IntentInputKind;
  readonly channel?: string;
  readonly receivedAt: string;
  readonly raw?: unknown;
}

export interface IntentActor {
  readonly id?: string;
  readonly type?: string;
  readonly displayName?: string;
}

export interface IntentTarget {
  readonly id?: string;
  readonly type?: string;
  readonly name?: string;
  readonly ref?: string;
}

export interface IntentConstraint {
  readonly key: string;
  readonly operator?: string;
  readonly value: unknown;
}

export interface IntentTraceEntry {
  readonly stage: IntentTraceStage;
  readonly at: string;
  readonly note?: string;
  readonly data?: Record<string, unknown>;
}

export interface IntentValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
  readonly severity: IntentValidationSeverity;
}

export interface IntentRecord {
  readonly schemaVersion: IntentRecordVersion;
  readonly intentId: string;
  readonly action: string;
  readonly summary: string;
  readonly source: IntentSource;
  readonly actor?: IntentActor;
  readonly target?: IntentTarget;
  readonly constraints: readonly IntentConstraint[];
  readonly priority: IntentPriority;
  readonly confidence: number;
  readonly trace: readonly IntentTraceEntry[];
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

export interface IntentParseOptions {
  readonly now?: () => Date;
  readonly idFactory?: () => string;
  readonly source?: Partial<IntentSource>;
  readonly actor?: IntentActor;
  readonly target?: IntentTarget;
  readonly metadata?: Record<string, unknown>;
}

export interface IntentValidationResult {
  readonly valid: boolean;
  readonly issues: readonly IntentValidationIssue[];
}

export interface IntentRecordDraft {
  readonly intentId?: string;
  readonly action?: string;
  readonly summary?: string;
  readonly source?: Partial<IntentSource>;
  readonly actor?: IntentActor;
  readonly target?: IntentTarget;
  readonly constraints?: readonly IntentConstraint[];
  readonly priority?: IntentPriority;
  readonly confidence?: number;
  readonly trace?: readonly IntentTraceEntry[];
  readonly metadata?: Record<string, unknown>;
  readonly createdAt?: string;
}
