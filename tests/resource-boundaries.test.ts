import { expect, it, vi } from "vitest";
import { Intent } from "../src/index.js";
import type { IntentConfig } from "../src/index.js";
import { core, data, fakeExecutor, orderSchema } from "./fixtures.js";

it.each([
  ["input UTF-8 bytes", { maxInputBytes: 2 }, { input: "中" }],
  [
    "context UTF-8 bytes",
    { maxContextBytes: 2 },
    { input: "x", context: "中" },
  ],
  [
    "context messages",
    { maxContextMessages: 1 },
    {
      input: "x",
      context: [
        { role: "user", content: "a" },
        { role: "tool", content: "b" },
      ],
    },
  ],
] as const)(
  "rejects %s before invoking an executor",
  async (_, limits, request) => {
    const executor = fakeExecutor(core());
    const intent = new Intent({ executor, limits });
    try {
      await expect(intent.parse(request)).rejects.toMatchObject({
        code: "LIMIT_EXCEEDED",
        stage: "input",
      });
      expect(executor.generate).not.toHaveBeenCalled();
    } finally {
      intent.dispose();
    }
  },
);

it.each([
  ["schema bytes", { maxSchemaBytes: 16 }, orderSchema],
  [
    "schema properties",
    { maxSchemaProperties: 1 },
    {
      type: "object",
      properties: { a: { type: "string" }, b: { type: "string" } },
    },
  ],
  [
    "schema depth",
    { maxSchemaDepth: 1 },
    {
      type: "object",
      properties: {
        a: { type: "object", properties: { b: { type: "string" } } },
      },
    },
  ],
] as const)("rejects %s during construction", (_, limits, schema) => {
  expect(
    () => new Intent({ limits, schema } as unknown as IntentConfig),
  ).toThrowError(
    expect.objectContaining({ code: "LIMIT_EXCEEDED", stage: "config" }),
  );
});

it.each([
  ["stage request bytes", { maxRequestBytes: 32 }, 0],
  ["candidate bytes", { maxOutputBytes: 16 }, 1],
  ["candidate depth", { maxCandidateDepth: 1 }, 1],
  ["candidate nodes", { maxCandidateNodes: 1 }, 1],
  ["intent count", { maxIntentCount: 1 }, 1],
] as const)("bounds %s with a stable error", async (_, limits, calls) => {
  const candidate = core();
  candidate.intents.push(structuredClone(candidate.intents[0]!));
  const executor = fakeExecutor(candidate);
  const intent = new Intent({ executor, limits });
  try {
    await expect(intent.parse({ input: "000123" })).rejects.toMatchObject({
      code: "LIMIT_EXCEEDED",
      stage: "core",
    });
    expect(executor.generate).toHaveBeenCalledTimes(calls);
  } finally {
    intent.dispose();
  }
});

it.each(["maxEvidenceEntries", "maxIssueCount"] as const)(
  "bounds %s in the data stage and retains core",
  async (limit) => {
    const candidate = data() as unknown as Record<string, unknown>;
    if (limit === "maxEvidenceEntries")
      candidate.evidence = [data().evidence[0], data().evidence[0]];
    else
      candidate.issues = Array.from({ length: 2 }, () => ({
        code: "DATA_CONFLICT",
        category: "business_information",
        path: "/data/orderId",
        message: "Conflicting identifiers.",
      }));
    const executor = fakeExecutor(core(), candidate);
    const intent = new Intent({
      schema: orderSchema,
      executor,
      limits: { [limit]: 1 },
    });
    try {
      await expect(intent.parse({ input: "000123" })).rejects.toMatchObject({
        code: "LIMIT_EXCEEDED",
        stage: "data",
        partialResult: { data: {}, intents: [{ action: "query" }] },
      });
      expect(executor.generate).toHaveBeenCalledTimes(2);
    } finally {
      intent.dispose();
    }
  },
);

it.each([false, true])("bounds combined description and explicit issues (explicit=%s)", async explicit => {
  const schema = { ...orderSchema, description: "An explicitly supplied order." };
  const candidate = data();
  candidate.descriptionChecks[0]!.verdict = "violated";
  candidate.descriptionChecks.push({ ...candidate.descriptionChecks[0]!, path: "/data" });
  const value = explicit ? { ...candidate, descriptionChecks: [candidate.descriptionChecks[0]], issues: [{ code: "DATA_CONFLICT", category: "business_information", path: "/data/orderId", message: "Conflicting identifiers." }] } : candidate;
  const intent = new Intent({ schema, executor: fakeExecutor(core(), value), limits: { maxIssueCount: 1 } });
  try {
    await expect(intent.parse({ input: "000123" })).rejects.toMatchObject({ code: "LIMIT_EXCEEDED", stage: "data", partialResult: { data: {} } });
  } finally { intent.dispose(); }
});

it("rejects an oversized data request before generation, retains core and releases capacity", async () => {
  const largeCore = core("Order 000123 " + "x".repeat(16000));
  const executor = fakeExecutor(largeCore, core());
  const intent = new Intent({
    schema: orderSchema,
    executor,
    limits: { maxRequestBytes: 10000, maxConcurrentParses: 1 },
  });
  try {
    await expect(intent.parse({ input: "000123" })).rejects.toMatchObject({
      code: "LIMIT_EXCEEDED",
      stage: "data",
      partialResult: { data: {}, intents: [{ target: largeCore.intents[0]!.target }] },
    });
    expect(executor.generate).toHaveBeenCalledTimes(1);
    expect((await intent.parse({ input: "000123", fields: [] })).data).toEqual({});
    expect(executor.generate).toHaveBeenCalledTimes(2);
  } finally {
    intent.dispose();
  }
});

it("evicts selected-schema cache entries while keeping selection and validation correct", async () => {
  const candidates = ["a", "b", "a"].flatMap((name) => [
    core(),
    {
      data: { [name]: "000123" },
      evidence: [
        {
          path: "/data/" + name,
          mode: "exact",
          sources: [{ sourceId: "input", quote: "000123" }],
        },
      ],
      descriptionChecks: [],
      fieldResults: [
        {
          path: "/data/" + name,
          status: "extracted",
          explanation: "Explicit value.",
        },
      ],
      issues: [],
    },
  ]);
  const intent = new Intent({
    schema: {
      type: "object",
      properties: { a: { type: "string" }, b: { type: "string" } },
    },
    limits: { maxSchemaCacheEntries: 1 },
    executor: fakeExecutor(...candidates),
  });
  try {
    for (const name of ["a", "b", "a"])
      expect(
        (await intent.parse({ input: "000123", fields: [name] })).data,
      ).toEqual({ [name]: "000123" });
  } finally {
    intent.dispose();
  }
});

it("data timeout aborts an uncooperative executor, retains core and releases capacity", async () => {
  const next = fakeExecutor(core(), data());
  let calls = 0;
  let aborted = false;
  const executor = {
    ...next,
    async generate(request: Parameters<typeof next.generate>[0]) {
      calls++;
      if (calls === 1)
        return { outcome: "complete" as const, text: JSON.stringify(core()) };
      if (calls === 2) {
        request.signal.addEventListener("abort", () => {
          aborted = true;
        });
        return new Promise<never>(() => {});
      }
      return next.generate(request);
    },
  };
  const intent = new Intent({
    schema: orderSchema,
    executor,
    timeoutMs: 1000,
    limits: { maxConcurrentParses: 1 },
  });
  try {
    vi.useFakeTimers();
    const failed = expect(intent.parse({ input: "000123" })).rejects.toMatchObject({
      code: "MODEL_TIMEOUT",
      stage: "data",
      partialResult: { data: {}, intents: [{ action: "query" }] },
    });
    await vi.advanceTimersByTimeAsync(1001);
    await failed;
    vi.useRealTimers();
    expect(aborted).toBe(true);
    expect((await intent.parse({ input: "000123" })).data).toEqual({
      orderId: "000123",
    });
  } finally {
    vi.useRealTimers();
    intent.dispose();
  }
});

it.each([
  ["DATA_REQUIRED_MISSING", "business_information"],
  ["DATA_AMBIGUOUS", "business_information"],
  ["DATA_CONFLICT", "business_information"],
  ["DATA_DEPENDENCY_MISSING", "business_information"],
  ["DATA_CARDINALITY_MISMATCH", "definition"],
  ["DATA_VALUE_UNREPRESENTABLE", "definition"],
  ["DATA_CONSTRAINT_VIOLATED", "definition"],
  ["DATA_DESCRIPTION_UNDETERMINED", "definition"],
] as const)(
  "reports %s directly without attempting a factual repair",
  async (code, category) => {
    const candidate = {
      data: {},
      evidence: [],
      descriptionChecks: [],
      fieldResults: [
        {
          path: "/data/orderId",
          status: "issue",
          explanation:
            "The selected field cannot faithfully represent the actual supplied facts.",
        },
      ],
      issues: [
        {
          code,
          category,
          path: "/data/orderId",
          message:
            "Actual business information cannot satisfy this definition.",
        },
      ],
    };
    const executor = fakeExecutor(core(), candidate);
    const intent = new Intent({ schema: orderSchema, executor });
    try {
      await expect(intent.parse({ input: "000123" })).rejects.toMatchObject({
        code: "DATA_EXTRACTION_FAILED",
        issues: [{ code, category }],
        partialResult: { data: {}, intents: [{ status: "ready" }] },
      });
      expect(executor.generate).toHaveBeenCalledTimes(2);
    } finally {
      intent.dispose();
    }
  },
);
