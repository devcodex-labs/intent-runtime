import { s } from "schema-dsl/pure";
import { Intent } from "@devcodex-labs/intent-runtime";
import { createApiExecutor } from "@devcodex-labs/intent-runtime/adapters/api";
const provider = process.env.INTENT_PROVIDER;
if (!["openai", "xai"].includes(provider))
  throw new Error("Set INTENT_PROVIDER to openai or xai.");
const apiKey =
  provider === "openai"
    ? process.env.INTENT_OPENAI_KEY
    : process.env.INTENT_XAI_KEY;
const model = process.env.INTENT_MODEL;
if (!apiKey || !model)
  throw new Error("Set the provider key and explicit INTENT_MODEL locally.");
const intent = new Intent({
  language: process.env.INTENT_LANGUAGE ?? "en",
  schema: s({
    orderId: s("string!").description(
      "The current requested order identifier. Preserve leading zeros; never guess.",
    ),
  }),
  executor: createApiExecutor({ provider, apiKey, model }),
});
try {
  console.log(
    JSON.stringify(
      await intent.parse({
        input:
          process.argv[2] ??
          "请查询订单 000123，不要取消或修改订单，查询结果用中文。",
        fields: process.argv.includes("--no-data") ? [] : ["orderId"],
      }),
      null,
      2,
    ),
  );
} catch (error) {
  if (typeof error.toJSON === "function")
    console.error(JSON.stringify(error.toJSON(), null, 2));
  else console.error("Recognition failed.");
  process.exitCode = 1;
} finally {
  intent.dispose();
}
