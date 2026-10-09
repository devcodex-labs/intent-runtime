import { isDeepStrictEqual } from "node:util";

// These frozen checks cover only the specified dimensions, not complete meaning.
export function checkExpectations(test, reply) {
  const checked = [];
  const mismatches = [];
  const result = reply.kind === "result" ? reply.result : reply.error?.partialResult;
  const check = (name, actual, expected) => {
    checked.push(name);
    if (!isDeepStrictEqual(actual, expected)) mismatches.push({ name, actual, expected });
  };
  if (test.expectedError) check("error.code", reply.error?.code, test.expectedError);
  if (test.expectedIssue) {
    check("error.code", reply.error?.code, "DATA_EXTRACTION_FAILED");
    check("expectedIssue", reply.error?.issues?.some((issue) => issue.code === test.expectedIssue) ?? false, true);
    check("partialResult.data", result?.data, {});
  }
  if (test.expectedActions) check("actions", result?.intents.map((intent) => intent.action), test.expectedActions);
  if (test.expectedStatuses) check("statuses", result?.intents.map((intent) => intent.status), test.expectedStatuses);
  if (test.expectedData) check("data", result?.data, test.expectedData);
  return { checked, mismatches, fullSemanticReview: "pending" };
}
