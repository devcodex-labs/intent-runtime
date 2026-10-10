import { mkdir, appendFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { dirname } from "node:path";
import { evaluationOutput } from "./output.mjs";
import { loadCases } from "./cases.mjs";
import { checkExpectations } from "./expected-result.mjs";
import { SCHEMA_PRESETS } from "./schemas.mjs";
import { Intent, IntentParseError } from "@devcodex/intent-runtime";
import { createApiExecutor } from "@devcodex/intent-runtime/adapters/api";
const args = process.argv.slice(2);
const selected = args.includes("--case")
  ? args[args.indexOf("--case") + 1]
  : undefined;
const repeat = args.includes("--repeat") ? Number(args[args.indexOf("--repeat") + 1]) : 1;
if (!Number.isInteger(repeat) || repeat < 1 || repeat > 50) throw new Error("--repeat must be an integer from 1 to 50.");
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

const files = args.includes("--all") ? ["semantics", "languages", "additional"]
  : args.includes("--additional") ? ["additional"]
    : args.includes("--languages") ? ["languages"] : ["semantics"];
let cases = loadCases(files);
if (selected) cases = cases.filter((item) => item.id === selected);
if (!cases.length) throw new Error("No matching evaluation cases.");
const output = evaluationOutput(provider + ".jsonl");
await mkdir(dirname(output), { recursive: true });
const records = [];
let unexpectedFailures = 0;
for (const item of cases) {
  for (let repetition = 1; repetition <= repeat; repetition++) {
    const test = item;
    const variant = { name: test.variant };
    let calls = 0;
    let unexpected = false;
    const stages = [];
    const api = createApiExecutor({ provider, model, apiKey });
    const executor = {
      ...api,
      async generate(request) {
        calls++;
        const started = performance.now();
        const stage = {
          stage: request.stage, instructions: request.instructions,
          instructionsSha256: createHash("sha256").update(request.instructions).digest("hex"),
          payload: request.payload, format: request.format,
        };
        try {
          const reply = await api.generate(request);
          stage.reply = reply;
          return reply;
        } finally {
          stage.durationMs = performance.now() - started;
          stages.push(stage);
        }
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
    const started = performance.now();
    const record = {
      id: test.id,
      variant: variant.name,
      dataset: test.dataset,
      repetition,
      provider,
      model,
      language: test.language ?? "en",
      request,
      schema: schema ?? null,
      rubric: test.rubric,
      promptVersion: "v1-dev.1-request-classification",
      stages,
      semanticReview: "pending",
    };
    try {
      record.result = await intent.parse(request);
      record.outcome = "complete";
      if (test.expectedError) {
        record.unexpected = "Expected " + test.expectedError;
        unexpected = true;
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
        unexpected = true;
    } finally {
      record.durationMs = performance.now() - started;
      record.calls = calls;
      record.automatedExpectations = checkExpectations(test, record.result
        ? { kind: "result", result: record.result }
        : { kind: "error", error: record.error });
      if (record.automatedExpectations.mismatches.length) unexpected = true;
      record.unexpectedProcessingOrExpectationFailure = unexpected;
      if (unexpected) unexpectedFailures++;
      intent.dispose();
    }
    records.push(record);
    await appendFile(output, JSON.stringify(record) + "\n");
    console.log(
      test.id +
        " / " +
        variant.name +
        " / repeat " + repetition + ": " +
        record.outcome +
        "; semantic review pending",
    );
  }
}
console.log(
  JSON.stringify({
    cases: cases.length,
    executed: records.length,
    repeat,
    unexpectedProcessingFailures: unexpectedFailures,
    semanticPassed: 0,
    semanticPending: records.length,
    output,
  }),
);
if (unexpectedFailures) process.exitCode = 1;
