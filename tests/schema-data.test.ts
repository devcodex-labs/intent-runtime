import { expect, it } from "vitest";
import { Intent } from "../src/index.js";
import { core, data, fakeExecutor } from "./fixtures.js";
import { SchemaStore, snapshotSchema } from "../src/schema/schema.js";
import { DEFAULT_LIMITS } from "../src/contracts/public.js";
it("normalizes exactLength without weakening existing length bounds", () => {
  const store = new SchemaStore(
    snapshotSchema(
      {
        type: "object",
        properties: { value: { type: "string", exactLength: 5, minLength: 6 } },
      },
      DEFAULT_LIMITS,
    ),
    2,
  );
  try {
    expect(store.validate(["value"], { value: "12345" }).valid).toBe(false);
  } finally {
    store.dispose();
  }
});
it("does not coerce numbers, fill business defaults or remove unselected fields", async () => {
  for (const candidate of [
    {
      data: { amount: "12" },
      evidence: [
        {
          path: "/data/amount",
          mode: "exact",
          sources: [{ sourceId: "input", quote: "12" }],
        },
      ],
      descriptionChecks: [],
      fieldResults: [
        { path: "/data/amount", status: "extracted", explanation: "given" },
      ],
      issues: [],
    },
    {
      data: { amount: 12, extra: "x" },
      evidence: [],
      descriptionChecks: [],
      fieldResults: [],
      issues: [],
    },
  ]) {
    const intent = new Intent({
      schema: {
        type: "object",
        properties: {
          amount: { type: "number" },
          unused: { type: "string", default: "example" },
        },
        required: ["amount"],
      },
      executor: fakeExecutor(core(), candidate),
      repairAttempts: 0,
    });
    await expect(
      intent.parse({ input: "预算 12", fields: ["amount"] }),
    ).rejects.toMatchObject({
      code: "MODEL_OUTPUT_INVALID",
      partialResult: { data: {} },
    });
    intent.dispose();
  }
});
it("optional can be omitted with an explicit no-evidence conclusion without filling defaults", async () => {
  const candidate = {
    data: {},
    evidence: [],
    descriptionChecks: [],
    fieldResults: [
      {
        path: "/data/urgent",
        status: "not_provided",
        explanation: "No urgency expressed.",
      },
    ],
    issues: [],
  };
  const intent = new Intent({
    schema: {
      type: "object",
      properties: { urgent: { type: "boolean", default: false } },
    },
    executor: fakeExecutor(core(), candidate),
  });
  expect((await intent.parse({ input: "查询订单 000123" })).data).toEqual({});
  intent.dispose();
});
it("native date constraints remain active and violations can be repaired", async () => {
  const candidate = {
    data: { day: "2026-10-09" },
    evidence: [
      {
        path: "/data/day",
        mode: "exact",
        sources: [{ sourceId: "input", quote: "2026-10-09" }],
      },
    ],
    descriptionChecks: [],
    fieldResults: [
      { path: "/data/day", status: "extracted", explanation: "provided" },
    ],
    issues: [],
  };
  const bad = structuredClone(candidate);
  bad.data.day = "not-a-date";
  bad.evidence[0]!.sources[0]!.quote = "not-a-date";
  const executor = fakeExecutor(core(), bad, candidate);
  const intent = new Intent({
    schema: {
      type: "object",
      properties: { day: { type: "string", format: "date" } },
      required: ["day"],
    },
    executor,
  });
  expect(
    (await intent.parse({ input: "not-a-date 是例子，实际日期 2026-10-09" }))
      .data,
  ).toEqual({ day: "2026-10-09" });
  intent.dispose();
});
it("semantic business findings do not alter the default status or return partial data", async () => {
  const candidate = data();
  candidate.descriptionChecks[0]!.verdict = "violated";
  const intent = new Intent({
    schema: {
      type: "object",
      properties: { orderId: { type: "string", description: "Current ID" } },
    },
    executor: fakeExecutor(core(), candidate),
  });
  await expect(intent.parse({ input: "000123" })).rejects.toMatchObject({
    code: "DATA_EXTRACTION_FAILED",
    partialResult: { intents: [{ status: "ready" }], data: {} },
  });
  intent.dispose();
});
it("requires nested evidence and supports JSON Pointer escaping", async () => {
  const candidate = {
    data: { "a/b~c": ["000123"] },
    evidence: [
      {
        path: "/data/a~1b~0c/0",
        mode: "exact",
        sources: [{ sourceId: "context:0", quote: "000123" }],
      },
    ],
    descriptionChecks: [],
    fieldResults: [
      {
        path: "/data/a~1b~0c",
        status: "extracted",
        explanation: "Given in context",
      },
    ],
    issues: [],
  };
  const intent = new Intent({
    schema: {
      type: "object",
      properties: {
        "a/b~c": { type: "array", items: { type: "string" }, minItems: 1 },
      },
    },
    executor: fakeExecutor(core(), candidate),
  });
  expect(
    (
      await intent.parse({
        input: "继续查询",
        context: [{ role: "user", content: "000123" }],
      })
    ).data,
  ).toEqual({ "a/b~c": ["000123"] });
  intent.dispose();
});
it("supports literal __proto__ business keys without prototype mutation", async () => {
  const schema = JSON.parse(
    '{"type":"object","properties":{"__proto__":{"type":"string"}},"required":["__proto__"]}',
  );
  const candidate = JSON.parse(
    '{"data":{"__proto__":"000123"},"evidence":[{"path":"/data/__proto__","mode":"exact","sources":[{"sourceId":"input","quote":"000123"}]}],"descriptionChecks":[],"fieldResults":[{"path":"/data/__proto__","status":"extracted","explanation":"Given"}],"issues":[]}',
  );
  const intent = new Intent({
    schema,
    executor: fakeExecutor(core(), candidate),
  });
  const result = await intent.parse({ input: "000123" });
  expect(Object.hasOwn(result.data, "__proto__")).toBe(true);
  expect(result.data.__proto__).toBe("000123");
  intent.dispose();
});
it("keeps nested special-name type, required and closed-object validation active", () => {
  const schema = JSON.parse(
    '{"type":"object","properties":{"record":{"type":"object","properties":{"__proto__":{"type":"string"}},"required":["__proto__"],"additionalProperties":false}}}',
  );
  const store = new SchemaStore(snapshotSchema(schema, DEFAULT_LIMITS), 2);
  try {
    expect(
      store.validate(["record"], JSON.parse('{"record":{"__proto__":"value"}}'))
        .valid,
    ).toBe(true);
    for (const input of [
      '{"record":{"__proto__":123}}',
      '{"record":{}}',
      '{"record":{"__proto__":"value","extra":1}}',
    ])
      expect(store.validate(["record"], JSON.parse(input)).valid).toBe(false);
  } finally {
    store.dispose();
  }
});
