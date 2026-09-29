import type { IntentTraceEntry, IntentTraceStage } from "./types.js";

export function createTraceEntry(
  stage: IntentTraceStage,
  note?: string,
  data?: Record<string, unknown>,
  now: () => Date = () => new Date()
): IntentTraceEntry {
  const entry: {
    stage: IntentTraceStage;
    at: string;
    note?: string;
    data?: Record<string, unknown>;
  } = {
    stage,
    at: now().toISOString()
  };

  if (note !== undefined) {
    entry.note = note;
  }

  if (data !== undefined) {
    entry.data = data;
  }

  return entry;
}

export function appendTrace(
  trace: readonly IntentTraceEntry[],
  stage: IntentTraceStage,
  note?: string,
  data?: Record<string, unknown>,
  now: () => Date = () => new Date()
): readonly IntentTraceEntry[] {
  return [...trace, createTraceEntry(stage, note, data, now)];
}
