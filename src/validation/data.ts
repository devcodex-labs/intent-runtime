import type { JsonValue } from "../contracts/public.js";
import type { Runtime } from "../core/config.js";
import type { ParseTask } from "../core/input.js";
import { DATA_ISSUE_CODES, IntentDataError, fail } from "../errors.js";
import type { DataIssueCode, IntentIssue } from "../errors.js";
import {
  isObject,
  onlyKeys,
  pointerKey,
  resolvePointer,
} from "../internal/object.js";
const categories: Record<DataIssueCode, string> = {
  DATA_REQUIRED_MISSING: "business_information",
  DATA_AMBIGUOUS: "business_information",
  DATA_CONFLICT: "business_information",
  DATA_CARDINALITY_MISMATCH: "definition",
  DATA_VALUE_UNREPRESENTABLE: "definition",
  DATA_CONSTRAINT_VIOLATED: "definition",
  DATA_DEPENDENCY_MISSING: "business_information",
  DATA_DESCRIPTION_UNDETERMINED: "definition",
  DATA_SOURCE_INVALID: "processing",
};
function invalid(message: string): never {
  return fail("MODEL_OUTPUT_INVALID", "data", message);
}
const text = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
export async function validateData(
  runtime: Runtime,
  task: ParseTask,
  value: Record<string, JsonValue>,
  signal?: AbortSignal,
): Promise<Record<string, JsonValue>> {
  onlyKeys(
    value,
    ["data", "evidence", "descriptionChecks", "fieldResults", "issues"],
    "data",
    "MODEL_OUTPUT_INVALID",
  );
  if (
    !isObject(value.data) ||
    !Array.isArray(value.evidence) ||
    !Array.isArray(value.descriptionChecks) ||
    !Array.isArray(value.fieldResults) ||
    !Array.isArray(value.issues)
  )
    invalid("Invalid data candidate envelope.");
  const data = value.data as Record<string, JsonValue>;
  if (Object.keys(data).some((key) => !task.selectedNames.includes(key)))
    invalid("Unselected extension field.");
  if (
    value.evidence.length > runtime.limits.maxEvidenceEntries ||
    value.descriptionChecks.length > runtime.limits.maxEvidenceEntries ||
    value.issues.length > runtime.limits.maxIssueCount
  )
    fail("LIMIT_EXCEEDED", "data", "Evidence or issue count exceeds limits.");
  function sources(input: unknown): string[] {
    if (!Array.isArray(input) || input.length === 0)
      return invalid("Missing source evidence.");
    return input.map((source) => {
      if (!isObject(source)) return invalid("Invalid source.");
      onlyKeys(source, ["sourceId", "quote"], "data", "MODEL_OUTPUT_INVALID");
      if (!text(source.sourceId) || !text(source.quote))
        return invalid("Source identifier and quote must be nonempty.");
      const material =
        source.sourceId === "input"
          ? task.input
          : task.context.find((item) => item.sourceId === source.sourceId)
              ?.content;
      if (material === undefined || !material.includes(source.quote))
        return invalid("Quote is absent from its declared source.");
      return source.quote;
    });
  }
  const leafPaths = new Set<string>();
  function leaves(value: JsonValue, path: string): void {
    if (Array.isArray(value) && value.length)
      value.forEach((item, index) => leaves(item, path + "/" + index));
    else if (isObject(value) && Object.keys(value).length)
      for (const [key, item] of Object.entries(value))
        leaves(item as JsonValue, path + "/" + pointerKey(key));
    else leafPaths.add(path);
  }
  for (const [name, item] of Object.entries(data))
    leaves(item, "/data/" + pointerKey(name));
  const evidence = new Set<string>();
  for (const entry of value.evidence) {
    if (!isObject(entry)) invalid("Invalid evidence entry.");
    onlyKeys(
      entry,
      ["path", "mode", "sources"],
      "data",
      "MODEL_OUTPUT_INVALID",
    );
    if (
      !text(entry.path) ||
      !entry.path.startsWith("/data/") ||
      !["exact", "semantic"].includes(entry.mode as string)
    )
      invalid("Invalid evidence path or mode.");
    const resolved = resolvePointer(value, entry.path);
    if (!resolved.found || evidence.has(entry.path))
      invalid("Missing or duplicate evidence path.");
    const quotes = sources(entry.sources);
    if (
      entry.mode === "exact" &&
      (typeof resolved.value !== "string" || !quotes.includes(resolved.value))
    )
      invalid("Exact value differs from its source quote.");
    evidence.add(entry.path);
  }
  if ([...leafPaths].some((path) => !evidence.has(path)))
    invalid("Every returned leaf or empty container needs source evidence.");
  const checks = new Set<string>();
  const issues: IntentIssue[] = [];
  for (const entry of value.descriptionChecks) {
    if (!isObject(entry)) invalid("Invalid description check.");
    onlyKeys(
      entry,
      ["path", "verdict", "explanation", "sources"],
      "data",
      "MODEL_OUTPUT_INVALID",
    );
    if (
      !text(entry.path) ||
      (entry.path !== "/data" && !entry.path.startsWith("/data/")) ||
      !resolvePointer(value, entry.path).found ||
      checks.has(entry.path) ||
      !text(entry.explanation) ||
      !["satisfied", "violated", "undetermined"].includes(
        entry.verdict as string,
      )
    )
      invalid("Invalid description verdict or path.");
    sources(entry.sources);
    checks.add(entry.path);
    if (entry.verdict !== "satisfied")
      issues.push({
        code:
          entry.verdict === "violated"
            ? "DATA_CONSTRAINT_VIOLATED"
            : "DATA_DESCRIPTION_UNDETERMINED",
        category: "definition",
        path: entry.path,
        message: entry.explanation,
      });
  }
  for (const entry of value.issues) {
    if (!isObject(entry)) invalid("Invalid issue.");
    onlyKeys(
      entry,
      ["code", "category", "path", "message"],
      "data",
      "MODEL_OUTPUT_INVALID",
    );
    if (
      typeof entry.code !== "string" ||
      !DATA_ISSUE_CODES.includes(entry.code as DataIssueCode) ||
      entry.code === "DATA_SOURCE_INVALID" ||
      entry.category !== categories[entry.code as DataIssueCode] ||
      !text(entry.message) ||
      (entry.path !== null &&
        (typeof entry.path !== "string" ||
          !/^\/data(?:\/|$)/u.test(entry.path)))
    )
      invalid("Invalid business issue code/category/path.");
    if (typeof entry.path === "string" && entry.path !== "/data") {
      const top = entry.path
        .split("/")[2]
        ?.replace(/~1/g, "/")
        .replace(/~0/g, "~");
      if (
        !top ||
        !task.selectedNames.includes(top) ||
        /~(?![01])/u.test(entry.path)
      )
        invalid("Issue refers to an unselected field.");
    }
    issues.push(entry as unknown as IntentIssue);
  }
  const fieldPaths = new Set<string>();
  for (const entry of value.fieldResults) {
    if (!isObject(entry)) invalid("Invalid field result.");
    onlyKeys(
      entry,
      ["path", "status", "explanation"],
      "data",
      "MODEL_OUTPUT_INVALID",
    );
    if (
      !text(entry.path) ||
      !text(entry.explanation) ||
      !["extracted", "not_provided", "not_applicable", "issue"].includes(
        entry.status as string,
      )
    )
      invalid("Invalid field result status.");
    const name = task.selectedNames.find(
      (name) => "/data/" + pointerKey(name) === entry.path,
    );
    if (name === undefined || fieldPaths.has(entry.path))
      invalid("Unexpected or duplicate field result.");
    fieldPaths.add(entry.path);
    const present = Object.hasOwn(data, name);
    if ((entry.status === "extracted") !== present && entry.status !== "issue")
      invalid("Field conclusion differs from returned data.");
    if (
      entry.status === "issue" &&
      !issues.some(
        (issue) =>
          issue.path === null ||
          issue.path === "/data" ||
          issue.path === entry.path ||
          issue.path?.startsWith(entry.path + "/"),
      )
    )
      invalid("Field issue lacks a matching business issue.");
    if (
      !present &&
      runtime.store.schema.required?.includes(name) &&
      entry.status !== "issue"
    )
      invalid(
        "Required omission needs an explicit business issue or corrected candidate.",
      );
  }
  if (fieldPaths.size !== task.selectedNames.length)
    invalid(
      "Every selected field needs a conclusion, including omitted optional fields.",
    );
  const native = await runtime.store.validate(task.selectedNames, data, signal);
  if (native.descriptionPaths.some(path => !checks.has(path)))
    invalid("Missing applicable description check.");
  if (issues.length) throw new IntentDataError(issues);
  if (!native.valid)
    invalid(
      "Candidate does not satisfy selected native Schema; correct it or report the actual business constraint.",
    );
  return data;
}
