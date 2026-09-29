import type { IntentRecord, IntentRecordDraft } from "./types.js";
import { createTraceEntry } from "./trace.js";

const DEFAULT_ACTION = "unspecified";

export function createIntentId(now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[-:.TZ]/g, "");
  const random = Math.random().toString(36).slice(2, 10);
  return `intent_${stamp}_${random}`;
}

export function normalizeIntentRecord(
  draft: IntentRecordDraft,
  options: {
    now?: () => Date;
    idFactory?: () => string;
  } = {}
): IntentRecord {
  const now = options.now ?? (() => new Date());
  const createdAt = draft.createdAt ?? now().toISOString();
  const intentId = draft.intentId ?? options.idFactory?.() ?? createIntentId(now());
  const action = normalizeAction(draft.action);
  const summary = normalizeSummary(draft.summary, action);
  const trace = draft.trace?.length
    ? draft.trace
    : [createTraceEntry("normalized", "Intent draft normalized.", undefined, now)];

  return {
    schemaVersion: "1.0",
    intentId,
    action,
    summary,
    source: {
      kind: draft.source?.kind ?? "unknown",
      ...(draft.source?.channel !== undefined ? { channel: draft.source.channel } : {}),
      receivedAt: draft.source?.receivedAt ?? createdAt,
      ...(draft.source?.raw !== undefined ? { raw: draft.source.raw } : {})
    },
    ...(draft.actor !== undefined ? { actor: draft.actor } : {}),
    ...(draft.target !== undefined ? { target: draft.target } : {}),
    constraints: draft.constraints ?? [],
    priority: draft.priority ?? "normal",
    confidence: draft.confidence ?? 0.5,
    trace,
    metadata: draft.metadata ?? {},
    createdAt
  };
}

function normalizeAction(action: string | undefined): string {
  const normalized = action?.trim().toLowerCase().replace(/\s+/g, "-");
  return normalized && normalized.length > 0 ? normalized : DEFAULT_ACTION;
}

function normalizeSummary(summary: string | undefined, action: string): string {
  const normalized = summary?.trim().replace(/\s+/g, " ");
  return normalized && normalized.length > 0 ? normalized : `Intent action: ${action}`;
}
