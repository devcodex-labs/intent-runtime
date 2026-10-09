import { readFile, mkdir, writeFile } from "node:fs/promises";
import { SCHEMA_PRESETS } from "./schemas.mjs";
import { Intent, IntentParseError } from "@devcodex-labs/intent-runtime";
import { createApiExecutor } from "@devcodex-labs/intent-runtime/adapters/api";
const args = process.argv.slice(2);
const selected = args.includes("--case")
  ? args[args.indexOf("--case") + 1]
  : undefined;
const provider = process.env.INTENT_PROVIDER,
  model = process.env.INTENT_MODEL;
const apiKey =
  provider === "openai"
    ? process.env.INTENT_OPENAI_KEY
    : process.env.INTENT_XAI_KEY;
if (!["openai", "xai"].includes(provider) || !model || !apiKey) {
  console.error(
    "NOT RUN: configure an explicit provider, model and local key.",
  );
  process.exit(2);
}

const files = args.includes("--languages") ? ["languages"] : ["semantics"];
let cases = [];
for (const file of files)
  cases.push(
    ...(await readFile("evaluations/cases/" + file + ".jsonl", "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line)),
  );
if (selected) cases = cases.filter((item) => item.id === selected);
if (!cases.length) throw new Error("No matching evaluation cases.");
const records = [];
let unexpectedFailures = 0;
for (const item of cases) {
  for (const variant of item.variants ?? [{ name: "default" }]) {
    const test = { ...item, ...variant };
    let calls = 0;
    const api = createApiExecutor({ provider, model, apiKey });
    const executor = {
      ...api,
      async generate(request) {
        calls++;
        return api.generate(request);
      },
    };
    const schema = SCHEMA_PRESETS[test.schemaPreset];
    const intent = new Intent({
      executor,
      ...(schema ? { schema } : {}),
      ...(test.language ? { language: test.language } : {}),
    });
    const request = {
      input: test.input,
      ...(test.fields !== undefined ? { fields: test.fields } : {}),
      ...(test.context !== undefined ? { context: test.context } : {}),
    };
    const started = Date.now();
    const record = {
      id: test.id,
      variant: variant.name,
      provider,
      model,
      language: test.language ?? "en",
      request,
      schema: schema ?? null,
      rubric: test.rubric,
      promptVersion: "v1-dev.0",
      semanticReview: "pending",
    };
    try {
      record.result = await intent.parse(request);
      record.outcome = "complete";
      if (test.expectedError) {
        record.unexpected = "Expected " + test.expectedError;
        unexpectedFailures++;
      }
    } catch (error) {
      record.error =
        error instanceof IntentParseError
          ? error.toJSON()
          : { message: "Unexpected local failure" };
      record.outcome = "error";
      if (
        test.expectedError
          ? record.error.code !== test.expectedError
          : record.error.code !== "DATA_EXTRACTION_FAILED"
      )
        unexpectedFailures++;
    } finally {
      record.durationMs = Date.now() - started;
      record.calls = calls;
      intent.dispose();
    }
    records.push(record);
    console.log(
      test.id +
        " / " +
        variant.name +
        ": " +
        record.outcome +
        "; semantic review pending",
    );
  }
}
await mkdir("evaluations/results", { recursive: true });
const output =
  "evaluations/results/" +
  new Date().toISOString().replace(/[:.]/g, "-") +
  "-" +
  provider +
  ".jsonl";
await writeFile(
  output,
  records.map((item) => JSON.stringify(item)).join("\n") + "\n",
);
console.log(
  JSON.stringify({
    cases: cases.length,
    executed: records.length,
    unexpectedProcessingFailures: unexpectedFailures,
    semanticPassed: 0,
    semanticPending: records.length,
    output,
  }),
);
if (unexpectedFailures) process.exitCode = 1;
