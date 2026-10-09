import { Validator } from "schema-dsl/pure";
import type {
  Clarification,
  IntentAction,
  IntentItem,
  IntentResult,
} from "../contracts/public.js";
import type { Runtime } from "../core/config.js";
import type { ParseTask } from "../core/input.js";
import { fail } from "../errors.js";
import { CORE_SCHEMA } from "../prompts/tasks.js";
const validator = new Validator({
  useDefaults: false,
  coerceTypes: false,
  removeAdditional: false,
  cache: { enabled: true, maxSize: 2 },
});
export interface CoreCandidate {
  normalizedInput: string;
  primaryIntent: string | null;
  requirements: string[];
  prohibitions: string[];
  intents: {
    action: IntentAction | null;
    target: string | null;
    requirements: string[];
    blockers: {
      clarificationReason: string | null;
      questions: Clarification[];
      confirmationReason: string | null;
      conditionReason: string | null;
    };
  }[];
}
const nonempty = (text: string): boolean => text.trim().length > 0;
export function assembleCore(
  runtime: Runtime,
  task: ParseTask,
  value: unknown,
): IntentResult {
  if (
    !validator.validate(CORE_SCHEMA, value, {
      coerce: false,
      smartCoerce: false,
      format: false,
    }).valid
  )
    fail("MODEL_OUTPUT_INVALID", "core", "Invalid core candidate shape.");
  const candidate = value as CoreCandidate;
  if (
    !nonempty(candidate.normalizedInput) ||
    (candidate.primaryIntent !== null && !nonempty(candidate.primaryIntent))
  )
    fail("MODEL_OUTPUT_INVALID", "core", "Empty core explanation.");
  if (candidate.intents.length > runtime.limits.maxIntentCount)
    fail("LIMIT_EXCEEDED", "core", "Candidate exceeds maxIntentCount.");
  if (
    [...candidate.requirements, ...candidate.prohibitions].some(
      (text) => !nonempty(text),
    )
  )
    fail("MODEL_OUTPUT_INVALID", "core", "Empty requirement or prohibition.");
  const intents: IntentItem[] = candidate.intents.map((item, index) => {
    const b = item.blockers;
    if (
      (item.target !== null && !nonempty(item.target)) ||
      item.requirements.some((text) => !nonempty(text)) ||
      [b.clarificationReason, b.confirmationReason, b.conditionReason].some(
        (text) => text !== null && !nonempty(text),
      ) ||
      b.questions.some(
        (q) =>
          !nonempty(q.question) || q.options.some((text) => !nonempty(text)),
      )
    )
      fail("MODEL_OUTPUT_INVALID", "core", "Empty intent explanation.");
    if (
      (b.clarificationReason === null) !== (b.questions.length === 0) ||
      (item.action === null && b.clarificationReason === null)
    )
      fail(
        "MODEL_OUTPUT_INVALID",
        "core",
        "Inconsistent clarification blockers.",
      );
    const base = {
      id: "i" + (index + 1),
      target: item.target,
      requirements: item.requirements,
    };
    const reason = [
      b.clarificationReason,
      b.confirmationReason,
      b.conditionReason,
    ]
      .filter((text): text is string => text !== null)
      .join("\n");
    if (b.clarificationReason !== null)
      return {
        ...base,
        action: item.action,
        status: "needs_clarification",
        reason,
        clarification: b.questions as [Clarification, ...Clarification[]],
      };
    if (b.confirmationReason !== null)
      return {
        ...base,
        action: item.action!,
        status: "awaiting_confirmation",
        reason,
      };
    if (b.conditionReason !== null)
      return { ...base, action: item.action!, status: "conditional", reason };
    return { ...base, action: item.action!, status: "ready" };
  });
  return {
    input: task.input,
    normalizedInput: candidate.normalizedInput,
    primaryIntent: candidate.primaryIntent,
    requirements: candidate.requirements,
    intents,
    prohibitions: candidate.prohibitions,
    data: {},
  };
}
