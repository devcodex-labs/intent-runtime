import { s } from "schema-dsl/pure";
import { Intent } from "@devcodex/intent-runtime";
import { createExampleExecutor } from "../shared/candidate-driver.mjs";
import { sampleInput } from "../shared/instances.mjs";
const fixture = process.argv.includes("--fixture");
const input = process.argv.slice(2).find(value => !value.startsWith("--")) ??
  (fixture ? sampleInput : "请查询订单 000123，不要取消或修改订单，查询结果用中文。");
const intent = new Intent({
  language: process.env.INTENT_LANGUAGE ?? "en",
  schema: s({
    orderId: s("string!").description(
      "The current requested order identifier. Preserve leading zeros; never guess.",
    ),
  }),
  executor: createExampleExecutor(fixture),
});
const controller = new AbortController();
const cancel = () => controller.abort();
process.once("SIGINT", cancel);
try {
  console.log(
    JSON.stringify(
      await intent.parse({
        input,
        fields: process.argv.includes("--no-data") ? [] : ["orderId"],
      }, { signal: controller.signal }),
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
  process.removeListener("SIGINT", cancel);
  intent.dispose();
}
