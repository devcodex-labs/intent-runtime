import { createScanner, SyntaxKind, parseTree } from "jsonc-parser";
import type { Node as JsonNode } from "jsonc-parser";
import type { IntentLimits, JsonValue } from "../contracts/public.js";
import type { ErrorStage } from "../errors.js";
import { fail } from "../errors.js";
import { bytes } from "../internal/object.js";
function decimalForm(token: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/u.exec(token)!;
  let digits = ((match[2] ?? "") + (match[3] ?? "")).replace(/^0+/, "");
  if (!digits) return "0";
  let exponent = BigInt(match[4] ?? "0") - BigInt((match[3] ?? "").length);
  while (digits.endsWith("0")) {
    digits = digits.slice(0, -1);
    exponent++;
  }
  return (match[1] ?? "") + digits + "e" + exponent.toString();
}
export function readJson(
  text: string,
  limits: IntentLimits,
  stage: ErrorStage,
): Record<string, JsonValue> {
  if (typeof text !== "string")
    fail("MODEL_OUTPUT_INVALID", stage, "Candidate must be JSON text.");
  if (bytes(text) > limits.maxOutputBytes)
    fail("LIMIT_EXCEEDED", stage, "Candidate exceeds maxOutputBytes.");
  const scanner = createScanner(text, false);
  let depth = 0,
    count = 0;
  for (
    let kind = scanner.scan();
    kind !== SyntaxKind.EOF;
    kind = scanner.scan()
  ) {
    if (
      kind === SyntaxKind.OpenBraceToken ||
      kind === SyntaxKind.OpenBracketToken
    ) {
      depth++;
      if (depth > limits.maxCandidateDepth)
        fail("LIMIT_EXCEEDED", stage, "Candidate exceeds maxCandidateDepth.");
    } else if (
      kind === SyntaxKind.CloseBraceToken ||
      kind === SyntaxKind.CloseBracketToken
    )
      depth--;
    if (++count > limits.maxCandidateNodes * 4)
      fail(
        "LIMIT_EXCEEDED",
        stage,
        "Candidate exceeds token complexity limit.",
      );
  }
  const errors: import("jsonc-parser").ParseError[] = [];
  const tree = parseTree(text, errors, {
    disallowComments: true,
    allowTrailingComma: false,
    allowEmptyContent: false,
  });
  if (!tree || errors.length || tree.type !== "object")
    fail(
      "MODEL_OUTPUT_INVALID",
      stage,
      "Expected one complete strict JSON object.",
    );
  let nodes = 0;
  function read(node: JsonNode): JsonValue {
    if (++nodes > limits.maxCandidateNodes)
      fail("LIMIT_EXCEEDED", stage, "Candidate exceeds maxCandidateNodes.");
    if (node.type === "object") {
      const result: Record<string, JsonValue> = Object.create(null) as Record<
        string,
        JsonValue
      >;
      for (const property of node.children ?? []) {
        const key = property.children?.[0]?.value as string;
        if (Object.hasOwn(result, key))
          fail(
            "MODEL_OUTPUT_INVALID",
            stage,
            "Duplicate decoded JSON property.",
          );
        result[key] = read(property.children![1]!);
      }
      return result;
    }
    if (node.type === "array") return (node.children ?? []).map(read);
    if (node.type === "number") {
      const token = text.slice(node.offset, node.offset + node.length);
      const value = Number(token);
      if (
        !Number.isFinite(value) ||
        (Number.isInteger(value) && !Number.isSafeInteger(value)) ||
        decimalForm(token) !== decimalForm(String(value))
      ) {
        fail(
          "MODEL_OUTPUT_INVALID",
          stage,
          "Numeric token cannot be represented without decimal round-trip loss; use the original definition and report DATA_VALUE_UNREPRESENTABLE when the true value is unrepresentable.",
        );
      }
      return value;
    }
    return node.value as JsonValue;
  }
  return read(tree) as Record<string, JsonValue>;
}
