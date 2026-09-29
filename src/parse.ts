import type { IntentParseOptions, IntentRecord, IntentRecordDraft } from "./types.js";
import { normalizeIntentRecord } from "./normalize.js";
import { createTraceEntry } from "./trace.js";

export function parseIntent(input: string, options: IntentParseOptions = {}): IntentRecord {
  const now = options.now ?? (() => new Date());
  const normalizedInput = input.trim();
  const action = inferAction(normalizedInput);
  const draft: IntentRecordDraft = {
    action,
    summary: normalizedInput,
    source: {
      kind: "natural-language",
      raw: input,
      ...options.source
    },
    ...(options.actor !== undefined ? { actor: options.actor } : {}),
    ...(options.target !== undefined ? { target: options.target } : {}),
    ...(options.metadata !== undefined ? { metadata: options.metadata } : {}),
    confidence: normalizedInput.length > 0 ? 0.6 : 0.1,
    trace: [
      createTraceEntry("received", "Natural language input received.", undefined, now),
      createTraceEntry("parsed", "Input mapped to a baseline intent record.", { action }, now)
    ]
  };

  return normalizeIntentRecord(draft, normalizeOptions(now, options.idFactory));
}

export function createIntentRecord(
  input: unknown,
  options: IntentParseOptions = {}
): IntentRecord {
  if (typeof input === "string") {
    return parseIntent(input, options);
  }

  const draft: IntentRecordDraft = {
    summary: "External payload intent.",
    source: {
      kind: "external-payload",
      raw: input,
      ...options.source
    },
    ...(options.actor !== undefined ? { actor: options.actor } : {}),
    ...(options.target !== undefined ? { target: options.target } : {}),
    ...(options.metadata !== undefined ? { metadata: options.metadata } : {}),
    trace: [
      createTraceEntry(
        "received",
        "External payload received.",
        undefined,
        options.now ?? (() => new Date())
      )
    ]
  };

  return normalizeIntentRecord(draft, normalizeOptions(options.now, options.idFactory));
}

function normalizeOptions(
  now: (() => Date) | undefined,
  idFactory: (() => string) | undefined
): {
  now?: () => Date;
  idFactory?: () => string;
} {
  return {
    ...(now !== undefined ? { now } : {}),
    ...(idFactory !== undefined ? { idFactory } : {})
  };
}

function inferAction(input: string): string {
  const text = input.toLowerCase();
  if (/(create|创建|新建|生成|建立)/u.test(text)) {
    return "create";
  }
  if (/(update|修改|更新|调整)/u.test(text)) {
    return "update";
  }
  if (/(delete|remove|删除|移除)/u.test(text)) {
    return "delete";
  }
  if (/(publish|release|发布|发版)/u.test(text)) {
    return "publish";
  }
  if (/(validate|verify|校验|验证)/u.test(text)) {
    return "validate";
  }
  return "unspecified";
}
