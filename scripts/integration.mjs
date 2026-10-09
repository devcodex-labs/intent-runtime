import assert from "node:assert/strict";
import { s } from "schema-dsl/pure";
import { Intent, IntentParseError } from "@devcodex-labs/intent-runtime";
import { createApiExecutor } from "@devcodex-labs/intent-runtime/adapters/api";
const provider = process.env.INTENT_PROVIDER,
  model = process.env.INTENT_MODEL;
const apiKey =
  provider === "openai"
    ? process.env.INTENT_OPENAI_KEY
    : process.env.INTENT_XAI_KEY;
if (!["openai", "xai"].includes(provider) || !apiKey || !model) {
  console.error(
    "NOT RUN: set INTENT_PROVIDER, INTENT_MODEL, and the provider key. Real model and desktop tests are manual; no result is counted as passed.",
  );
  process.exit(2);
}
let calls = 0;
const api = createApiExecutor({ provider, model, apiKey });
const executor = {
  ...api,
  async generate(request) {
    calls++;
    return api.generate(request);
  },
};
const schema = s({
  orderId: s("string!").description(
    "All order identifiers for the current request. Preserve exact leading zeros. This single string cannot represent multiple requested orders; report cardinality mismatch instead of choosing one.",
  ),
});
const intent = new Intent({ schema, executor });
try {
  const input = "请查询订单 000123，不要取消或修改订单，查询结果用中文。";
  const result = await intent.parse({ input, fields: ["orderId"] });
  assert.equal(result.input, input);
  assert.equal(result.data.orderId, "000123");
  assert.ok(result.intents.some((item) => item.action === "query"));
  assert.ok(
    result.intents.every((item) => !["modify", "delete"].includes(item.action)),
  );
  const before = calls;
  const noData = await intent.parse({ input, fields: [] });
  assert.deepEqual(noData.data, {});
  assert.equal(calls - before >= 1 && calls - before <= 2, true);
  let extensionFailed = false;
  try {
    await intent.parse({
      input: "查询订单 001 和 002，不要修改订单。",
      fields: ["orderId"],
    });
  } catch (error) {
    assert.ok(error instanceof IntentParseError);
    assert.equal(error.code, "DATA_EXTRACTION_FAILED");
    assert.ok(error.partialResult);
    assert.deepEqual(error.partialResult.data, {});
    extensionFailed = true;
  }
  assert.ok(
    extensionFailed,
    "Multiple real orders must not become an arbitrary scalar ID.",
  );
  console.log(
    JSON.stringify(
      {
        provider,
        model,
        functionalChecks: 3,
        calls,
        semanticReview:
          "pending; review scope, prohibitions, delivery language and status manually",
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify(
      error instanceof IntentParseError
        ? error.toJSON()
        : { message: error.message },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  intent.dispose();
}
