import { describe, expect, it } from "vitest";
import { s } from "schema-dsl/pure";
import {
  Intent,
  IntentDataError,
  IntentParseError,
  DEFAULT_LIMITS,
} from "../src/index.js";
import type {
  IntentConfig,
  IntentParseRequest,
  ModelReply,
} from "../src/index.js";
import { readJson } from "../src/validation/json-reader.js";
import { core, data, fakeExecutor, orderSchema } from "./fixtures.js";
describe("public request and core pipeline", () => {
  it("reports a malformed executor reply through the stable error contract", async () => {
    const executor = {
      ...fakeExecutor(),
      generate: async () => undefined as unknown as ModelReply,
    };
    const intent = new Intent({ executor });
    await expect(intent.parse({ input: "x" })).rejects.toMatchObject({
      code: "MODEL_OUTPUT_INVALID",
      stage: "core",
    });
    intent.dispose();
  });
  it("keeps exact input and skips data for []", async () => {
    const executor = fakeExecutor(core());
    const intent = new Intent({ schema: orderSchema, executor });
    const input = "  查询订单 000123\n";
    const result = await intent.parse({ input, fields: [] });
    expect(result.input).toBe(input);
    expect(result.data).toEqual({});
    expect(executor.generate).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(executor.generate.mock.calls[0]![0].payload),
    ).not.toHaveProperty("selectedFields");
    intent.dispose();
  });
  it("keeps the core task identical across all/partial/empty selection", async () => {
    const candidate = data();
    const all = {
      ...candidate,
      fieldResults: [
        ...candidate.fieldResults,
        {
          path: "/data/urgent",
          status: "not_provided",
          explanation: "No urgency specified.",
        },
      ],
    };
    const executor = fakeExecutor(core(), all, core(), candidate, core());
    const intent = new Intent({
      schema: {
        ...orderSchema,
        properties: { ...orderSchema.properties, urgent: { type: "boolean" } },
      },
      executor,
    });
    const results = [];
    for (const fields of [undefined, ["orderId"], []])
      results.push(
        await intent.parse({
          input: "000123",
          ...(fields === undefined ? {} : { fields }),
        }),
      );
    expect(executor.generate.mock.calls[0]![0].payload).toBe(
      executor.generate.mock.calls[2]![0].payload,
    );
    expect(executor.generate.mock.calls[0]![0].payload).toBe(
      executor.generate.mock.calls[4]![0].payload,
    );
    expect(results.map((result) => result.intents)).toEqual([
      results[0]!.intents,
      results[0]!.intents,
      results[0]!.intents,
    ]);
    intent.dispose();
  });
  it("retains repeated stages and never sorts by action", async () => {
    const candidate = core();
    candidate.intents = [
      { ...candidate.intents[0]!, action: "execute", target: "First test" },
      { ...candidate.intents[0]!, action: "modify", target: "Configuration" },
      { ...candidate.intents[0]!, action: "execute", target: "Second test" },
    ];
    const intent = new Intent({ executor: fakeExecutor(candidate) });
    expect(
      (await intent.parse({ input: "测试、修改、再测试" })).intents.map(
        (item) => item.target,
      ),
    ).toEqual(["First test", "Configuration", "Second test"]);
    intent.dispose();
  });
  it("uses native DSL, defaults en, deduplicates selected names and runs two stages", async () => {
    const executor = fakeExecutor(core(), data());
    const intent = new Intent({
      schema: s({ orderId: s("string!").description("Current ID") }),
      executor,
    });
    expect(
      await intent.parse({
        input: "查询订单 000123",
        fields: ["orderId", "orderId"],
      }),
    ).toMatchObject({
      data: { orderId: "000123" },
      intents: [{ id: "i1", status: "ready" }],
    });
    expect(executor.generate).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse(executor.generate.mock.calls[0]![0].payload)
        .structuredLanguage,
    ).toBe("en");
    intent.dispose();
  });
  it.each([
    null,
    "input",
    [],
    {},
    { input: " " },
    { input: "x", field: [] },
    { input: "x", fields: null },
    { input: "x", context: null },
    { input: "x", context: [{ role: "system", content: "x" }] },
  ])("rejects malformed request before generating: %j", async (request) => {
    const executor = fakeExecutor(core());
    const intent = new Intent({ executor });
    await expect(
      intent.parse(request as IntentParseRequest),
    ).rejects.toMatchObject({ code: "INPUT_INVALID" });
    expect(executor.generate).not.toHaveBeenCalled();
    intent.dispose();
  });
  it("rejects old extra arguments and unknown selections", async () => {
    const intent = new Intent({ executor: fakeExecutor(core()) });
    await expect(
      Reflect.apply(intent.parse, intent, [{ input: "x" }, []]),
    ).rejects.toMatchObject({ code: "INPUT_INVALID" });
    await expect(
      intent.parse({ input: "x", fields: ["orderId"] }),
    ).rejects.toMatchObject({ code: "UNKNOWN_FIELD" });
    intent.dispose();
  });
  it("can construct without executor, but parse requires it", async () => {
    const intent = new Intent();
    await expect(intent.parse({ input: "x" })).rejects.toMatchObject({
      code: "EXECUTOR_NOT_CONFIGURED",
    });
    intent.dispose();
  });
  it("preserves all blockers with priority, known targets and repeated actions", async () => {
    const candidate = core();
    const item = candidate.intents[0]!;
    Object.assign(item.blockers, {
      clarificationReason: "Environment unknown",
      questions: [{ question: "Which environment?", options: [] }],
      confirmationReason: "Confirm first",
      conditionReason: "Tests pass first",
    });
    const intent = new Intent({ executor: fakeExecutor(candidate) });
    const result = await intent.parse({
      input: "发布前测试通过并确认，环境未知",
      fields: [],
    });
    expect(result.intents[0]).toMatchObject({
      status: "needs_clarification",
      reason: "Environment unknown\nConfirm first\nTests pass first",
    });
    intent.dispose();
  });
  it("allows unknown action only with a valid clarification", async () => {
    const candidate = core();
    Object.assign(candidate.intents[0]!, { action: null });
    Object.assign(candidate.intents[0]!.blockers, {
      clarificationReason: "Action unknown",
      questions: [{ question: "Which action?", options: [] }],
    });
    const intent = new Intent({ executor: fakeExecutor(candidate) });
    expect(
      (await intent.parse({ input: "处理订单 A" })).intents[0],
    ).toMatchObject({ action: null, status: "needs_clarification" });
    intent.dispose();
  });
  it("repair is bounded and malformed core does not create partialResult", async () => {
    const executor = fakeExecutor("{bad", "{bad");
    const intent = new Intent({ executor });
    await expect(intent.parse({ input: "x" })).rejects.toMatchObject({
      code: "MODEL_OUTPUT_INVALID",
      stage: "core",
    });
    expect(executor.generate).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse(executor.generate.mock.calls[1]![0].payload),
    ).toHaveProperty("repair");
    intent.dispose();
  });
  it("repairs data type/source mistakes rather than classifying them as user missing", async () => {
    const wrong = data();
    Object.assign(wrong.data, { orderId: 123 });
    const executor = fakeExecutor(core(), wrong, data());
    const intent = new Intent({ schema: orderSchema, executor });
    expect((await intent.parse({ input: "查询订单 000123" })).data).toEqual({
      orderId: "000123",
    });
    expect(executor.generate).toHaveBeenCalledTimes(3);
    intent.dispose();
  });
  it("terminates actual business missing without repair and retains the default", async () => {
    const missing = {
      data: {},
      evidence: [],
      descriptionChecks: [],
      fieldResults: [
        {
          path: "/data/orderId",
          status: "issue",
          explanation: "No order given",
        },
      ],
      issues: [
        {
          code: "DATA_REQUIRED_MISSING",
          category: "business_information",
          path: "/data/orderId",
          message: "No order given",
        },
      ],
    };
    const executor = fakeExecutor(core(), missing);
    const intent = new Intent({ schema: orderSchema, executor });
    try {
      await intent.parse({ input: "查询订单" });
      throw new Error("Expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(IntentDataError);
      expect(error).toMatchObject({
        stage: "data",
        partialResult: { input: "查询订单", data: {} },
      });
    }
    expect(executor.generate).toHaveBeenCalledTimes(2);
    intent.dispose();
  });
  it("requires conclusions for omitted optional selected fields", async () => {
    const intent = new Intent({
      schema: { type: "object", properties: { orderId: { type: "string" } } },
      repairAttempts: 0,
      executor: fakeExecutor(core(), {
        data: {},
        evidence: [],
        descriptionChecks: [],
        fieldResults: [],
        issues: [],
      }),
    });
    await expect(
      intent.parse({ input: "查询订单 000123" }),
    ).rejects.toMatchObject({
      code: "MODEL_OUTPUT_INVALID",
      stage: "data",
      partialResult: { data: {} },
    });
    intent.dispose();
  });
  it("keeps partialResult after unrepaired data source failure", async () => {
    const wrong = data("999");
    const intent = new Intent({
      schema: orderSchema,
      repairAttempts: 0,
      executor: fakeExecutor(core(), wrong),
    });
    await expect(
      intent.parse({ input: "查询订单 000123" }),
    ).rejects.toMatchObject({
      code: "MODEL_OUTPUT_INVALID",
      partialResult: { data: {} },
    });
    intent.dispose();
  });
  it("snapshots caller schema and context without mutation", async () => {
    const schema = structuredClone(orderSchema);
    const context = [{ role: "user" as const, content: "订单 000123" }];
    const executor = fakeExecutor(core(), data());
    const intent = new Intent({ schema, executor });
    schema.properties.orderId.type = "number";
    await intent.parse({ input: "查询订单 000123", context });
    expect(context).toEqual([{ role: "user", content: "订单 000123" }]);
    intent.dispose();
  });
  it("deadline settles even when executor ignores abort", async () => {
    const executor = fakeExecutor();
    executor.generate.mockImplementation(() => new Promise(() => {}));
    const intent = new Intent({ executor, timeoutMs: 15 });
    await expect(intent.parse({ input: "x" })).rejects.toMatchObject({
      code: "MODEL_TIMEOUT",
    });
    expect(executor.generate.mock.calls[0]![0].signal.aborted).toBe(true);
    intent.dispose();
  });
  it("disposal cancels active calls, is idempotent and refuses future calls", async () => {
    const executor = fakeExecutor();
    executor.generate.mockImplementation(() => new Promise(() => {}));
    const intent = new Intent({ executor });
    const pending = intent.parse({ input: "x" });
    await Promise.resolve();
    intent.dispose();
    intent.dispose();
    await expect(pending).rejects.toMatchObject({ code: "INSTANCE_DISPOSED" });
    await expect(intent.parse({ input: "x" })).rejects.toMatchObject({
      code: "INSTANCE_DISPOSED",
    });
  });
  it("enforces concurrency and input limits", async () => {
    const executor = fakeExecutor();
    executor.generate.mockImplementation(() => new Promise(() => {}));
    const intent = new Intent({
      executor,
      limits: { maxConcurrentParses: 1, maxInputBytes: 2 },
    });
    await expect(intent.parse({ input: "long" })).rejects.toMatchObject({
      code: "LIMIT_EXCEEDED",
    });
    const pending = intent.parse({ input: "x" });
    await expect(intent.parse({ input: "y" })).rejects.toMatchObject({
      code: "LIMIT_EXCEEDED",
    });
    intent.dispose();
    await expect(pending).rejects.toBeInstanceOf(IntentParseError);
  });
});
describe("language and native Schema support", () => {
  it.each([
    "en",
    "zh-CN",
    "EN-us",
    "ja",
    "ar",
    "fr",
    "pt-BR",
    "zh-Hant-TW",
    "i-klingon",
    "en-u-ca-gregory",
    "en-x-local",
    "en-Qaaa-QM",
    "en-Qabx-XZ",
  ])("accepts registered language %s", (language) => {
    const intent = new Intent({ language });
    intent.dispose();
  });
  it.each([
    "English",
    "en_US",
    "日本語",
    "zz-ZZ",
    "en-US-US",
    " und",
    "und",
    "mul",
    "zxx",
    "x-private",
    "qaa",
    "en-a-abc",
    "en-u-ca-u-nu",
  ])("rejects invalid or unspecified language %s", (language) => {
    expect(() => new Intent({ language })).toThrowError(IntentParseError);
  });
  it.each([null, 0, [], true])("rejects non-string language %j", (language) => {
    expect(
      () => new Intent({ language } as unknown as IntentConfig),
    ).toThrowError(IntentParseError);
  });
  it("accepts implicit and explicit Draft-7 and rejects unsupported dialects/runtime functions", () => {
    for (const schema of [
      orderSchema,
      { ...orderSchema, $schema: "http://json-schema.org/draft-07/schema#" },
    ])
      new Intent({ schema }).dispose();
    expect(
      () =>
        new Intent({
          schema: {
            ...orderSchema,
            $schema: "https://json-schema.org/draft/2020-12/schema",
          },
        }),
    ).toThrowError();
    expect(
      () => new Intent({ schema: s({ x: s("string").custom(() => true) }) }),
    ).toThrowError();
    expect(
      () => new Intent({ schema: { ...orderSchema, if: { type: "object" } } }),
    ).toThrowError();
  });
  it("supports selection by literal dotted names and nested required", async () => {
    const executor = fakeExecutor(core(), {
      data: { "a.b": { id: "000123" } },
      evidence: [
        {
          path: "/data/a.b/id",
          mode: "exact",
          sources: [{ sourceId: "input", quote: "000123" }],
        },
      ],
      descriptionChecks: [],
      fieldResults: [
        { path: "/data/a.b", status: "extracted", explanation: "Provided" },
      ],
      issues: [],
    });
    const intent = new Intent({
      schema: {
        type: "object",
        properties: {
          "a.b": {
            type: "object",
            properties: { id: { type: "string" } },
            required: ["id"],
          },
          unused: { type: "string" },
        },
        required: ["unused"],
      },
      executor,
    });
    expect(
      (await intent.parse({ input: "000123", fields: ["a.b"] })).data,
    ).toEqual({ "a.b": { id: "000123" } });
    intent.dispose();
  });
  it.each([
    { const: { orderId: "000123" } },
    { enum: [{ orderId: "000123" }] },
  ])("rejects non-projectable root value constraints (%j)", (constraint) => {
    expect(
      () => new Intent({ schema: { ...orderSchema, ...constraint } }),
    ).toThrowError(expect.objectContaining({ code: "SCHEMA_UNSUPPORTED" }));
  });
});
describe("strict JSON and resource boundaries", () => {
  it.each([
    '{"a":1,}',
    '{/*x*/"a":1}',
    '{"a":1} extra',
    '{"a":1,"\\u0061":2}',
    '{"a":9007199254740993}',
    '{"a":1e400}',
    '{"a":0.10000000000000001}',
    "[]",
  ])("rejects %s", (candidate) => {
    expect(() =>
      readJson(candidate, { ...DEFAULT_LIMITS }, "data"),
    ).toThrowError(IntentParseError);
  });
  it("preserves special own keys and safe decimal forms", () => {
    const value = readJson(
      '{"__proto__":{"x":1},"a":1.0,"b":0.1}',
      { ...DEFAULT_LIMITS },
      "data",
    );
    expect(Object.hasOwn(value, "__proto__")).toBe(true);
    expect(value.a).toBe(1);
    expect(value.b).toBe(0.1);
    expect(Object.getPrototypeOf(value)).toBe(null);
  });
  it("does not count brackets or escaped quotes inside JSON strings as nesting", () => {
    const value = { text: '[]{}\\"' + "[}".repeat(1000) + "e\u0301😀" };
    expect(readJson(JSON.stringify(value), { ...DEFAULT_LIMITS, maxCandidateDepth: 1 }, "data")).toEqual(value);
  });
  it("rejects deep nesting before recursive parseTree can overflow", () => {
    const candidate =
      '{"x":' + "[".repeat(10000) + "0" + "]".repeat(10000) + "}";
    expect(() =>
      readJson(candidate, { ...DEFAULT_LIMITS }, "data"),
    ).toThrowError(expect.objectContaining({ code: "LIMIT_EXCEEDED" }));
  });
  it.each([
    { name: "missing value", prefix: '{"a":' + "]".repeat(10000) + ',"x":' },
    { name: "extra closers", prefix: '{"a":0' + "]".repeat(10000) + ',"x":' },
    { name: "mismatched container", prefix: '{"a":{],"x":' },
  ])(
    "rejects mismatched closers before recursive parser recovery ($name)",
    ({ prefix }) => {
      const candidate =
        prefix + "[".repeat(10000) + "0" + "]".repeat(10000) + "}";
      expect(() =>
        readJson(candidate, { ...DEFAULT_LIMITS }, "data"),
      ).toThrowError(expect.objectContaining({ code: "MODEL_OUTPUT_INVALID" }));
    },
  );
});
