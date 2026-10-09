import { expect, it } from "vitest";
import { Intent } from "../src/index.js";
import { core, data, fakeExecutor } from "./fixtures.js";
import { SchemaStore, snapshotSchema } from "../src/schema/schema.js";
import { DEFAULT_LIMITS } from "../src/contracts/public.js";
import type { JSONSchema } from "../src/index.js";
it.each(["anyOf", "oneOf"] as const)("requires descriptions only from matching %s branches", async keyword => {
  const schema: JSONSchema = { type: "object", properties: { value: { [keyword]: [
    { type: "string", description: "Keep the string." },
    { type: "number", minimum: 10 },
  ] } } };
  const store = new SchemaStore(snapshotSchema(schema, DEFAULT_LIMITS), 2);
  try {
    expect(await store.validate(["value"], { value: 12 })).toEqual({ valid: true, descriptionPaths: [] });
    expect(await store.validate(["value"], { value: "000123" })).toEqual({ valid: true, descriptionPaths: ["/data/value"] });
    // A number below the bound matches neither described branch.
    expect(await store.validate(["value"], { value: 5 })).toEqual({ valid: false, descriptionPaths: [] });
  } finally { store.dispose(); }
});
it("walks nested dynamic arrays, literal special names and allOf without duplicate paths", async () => {
  const schema = JSON.parse('{"type":"object","description":"Root contract","properties":{"extra":{"type":"object","additionalProperties":{"type":"array","items":{"allOf":[{"type":"object","properties":{"__proto__":{"type":"string","description":"Keep identifier"}}},{"description":"Item contract"}]}}}}}');
  const store = new SchemaStore(snapshotSchema(schema, DEFAULT_LIMITS), 2);
  try {
    const value = JSON.parse('{"extra":{"a/~":[{"__proto__":"000123"}]}}');
    expect(await store.validate(["extra"], value)).toEqual({ valid: true, descriptionPaths: ["/data", "/data/extra/a~1~0/0/__proto__", "/data/extra/a~1~0/0"] });
  } finally { store.dispose(); }
});
it("does not require description checks for absent or unrestricted dynamic values", async () => {
  const schema: JSONSchema = { type: "object", properties: { extra: { type: "object", additionalProperties: true }, missing: { type: "string", description: "Only when returned" } } };
  const store = new SchemaStore(snapshotSchema(schema, DEFAULT_LIMITS), 2);
  try { expect(await store.validate(["extra", "missing"], { extra: { value: "000123" } })).toEqual({ valid: true, descriptionPaths: [] }); }
  finally { store.dispose(); }
});
it.each([false, true])("checks descriptions on dynamic returned properties (complete=%s)", async complete => {
  const candidate = {
    data: { extra: { "id/~": "000123" } },
    evidence: [{ path: "/data/extra/id~1~0", mode: "exact", sources: [{ sourceId: "input", quote: "000123" }] }],
    descriptionChecks: complete ? [{ path: "/data/extra/id~1~0", verdict: "satisfied", explanation: "Preserves identifier.", sources: [{ sourceId: "input", quote: "000123" }] }] : [],
    fieldResults: [{ path: "/data/extra", status: "extracted", explanation: "Explicit ID." }], issues: [],
  };
  const intent = new Intent({ schema: { type: "object", properties: { extra: { type: "object", additionalProperties: { type: "string", description: "Preserve identifier." } } } }, executor: fakeExecutor(core(), candidate), repairAttempts: 0 });
  try {
    if (complete) expect((await intent.parse({ input: "000123" })).data).toEqual(candidate.data);
    else await expect(intent.parse({ input: "000123" })).rejects.toMatchObject({ code: "MODEL_OUTPUT_INVALID", stage: "data", partialResult: { data: {} } });
  } finally { intent.dispose(); }
});
it("normalizes exactLength without weakening existing length bounds", async () => {
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
    expect((await store.validate(["value"], { value: "12345" })).valid).toBe(false);
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
it("keeps nested special-name type, required and closed-object validation active", async () => {
  const schema = JSON.parse(
    '{"type":"object","properties":{"record":{"type":"object","properties":{"__proto__":{"type":"string"}},"required":["__proto__"],"additionalProperties":false}}}',
  );
  const store = new SchemaStore(snapshotSchema(schema, DEFAULT_LIMITS), 2);
  try {
    expect(
      (await store.validate(["record"], JSON.parse('{"record":{"__proto__":"value"}}'))).valid,
    ).toBe(true);
    for (const input of [
      '{"record":{"__proto__":123}}',
      '{"record":{}}',
      '{"record":{"__proto__":"value","extra":1}}',
    ])
      expect((await store.validate(["record"], JSON.parse(input))).valid).toBe(false);
  } finally {
    store.dispose();
  }
});

it("preserves Unicode code points rather than normalizing an exact identifier", async () => {
  const identifier = "e\u0301-000١٢٣😀";
  const exact = data(identifier);
  const normalized = structuredClone(exact);
  normalized.data.orderId = identifier.normalize("NFC");
  const executor = fakeExecutor(core(), normalized, core(), exact);
  const intent = new Intent({
    schema: { type: "object", properties: { orderId: { type: "string", description: "Exact ID" } } },
    executor,
    repairAttempts: 0,
  });
  try {
    await expect(intent.parse({ input: identifier })).rejects.toMatchObject({
      code: "MODEL_OUTPUT_INVALID", stage: "data", partialResult: { data: {} },
    });
    expect((await intent.parse({ input: identifier })).data.orderId).toBe(identifier);
  } finally {
    intent.dispose();
  }
});

it.each([
  ["false", false, { type: "boolean" }],
  ["zero", 0, { type: "number" }],
  ["empty array", [], { type: "array", items: { type: "string" } }],
  ["empty object", {}, { type: "object", properties: {}, additionalProperties: false }],
] as const)("requires evidence for an explicitly supplied %s", async (_, value, definition) => {
  const input = "Explicit value: " + JSON.stringify(value);
  const candidate = {
    data: { value },
    evidence: [{ path: "/data/value", mode: "semantic", sources: [{ sourceId: "input", quote: input }] }],
    descriptionChecks: [],
    fieldResults: [{ path: "/data/value", status: "extracted", explanation: "Explicit value" }],
    issues: [],
  };
  const executor = fakeExecutor(core(), { ...candidate, evidence: [] }, core(), candidate);
  const intent = new Intent({
    schema: { type: "object", properties: { value: definition } },
    executor,
    repairAttempts: 0,
  });
  try {
    await expect(intent.parse({ input })).rejects.toMatchObject({
      code: "MODEL_OUTPUT_INVALID", stage: "data", partialResult: { data: {} },
    });
    expect((await intent.parse({ input })).data).toEqual({ value });
  } finally {
    intent.dispose();
  }
});
