import { expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Intent } from "../src/index.js";
import {
  createApiExecutor,
  readCompletedResponse,
} from "../src/adapters/api/index.js";
import type { ModelRequest } from "../src/index.js";
import type { ApiExecutorConfig } from "../src/adapters/api/index.js";
import { serveIntentMcp } from "../src/transports/mcp/index.js";
import type { BridgeReply } from "../src/bridge/index.js";
import { core, data, fakeExecutor, orderSchema } from "./fixtures.js";
it.each([{ fetch: "invalid" }, { extra: true }])(
  "rejects malformed API configuration before invoking the SDK (%j)",
  (extra) => {
    expect(() =>
      createApiExecutor({
        provider: "openai",
        apiKey: "fixture",
        model: "fixture",
        ...extra,
      } as unknown as ApiExecutorConfig),
    ).toThrowError(expect.objectContaining({ code: "CONFIG_INVALID" }));
  },
);
function completed(value: unknown) {
  return {
    id: "fixture",
    status: "completed",
    output: [
      {
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: JSON.stringify(value) }],
      },
    ],
  };
}
it.each(["openai", "xai"] as const)(
  "maps %s Responses requests and yields the public result",
  async (provider) => {
    const requests: { url: string; body: Record<string, unknown> }[] = [];
    const transport: typeof fetch = vi.fn(async (input, init) => {
      requests.push({
        url: String(input),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });
      return new Response(
        JSON.stringify(completed(requests.length === 1 ? core() : data())),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const intent = new Intent({
      schema: orderSchema,
      executor: createApiExecutor({
        provider,
        apiKey: "test-not-a-real-key",
        model: "fixture-model",
        fetch: transport,
        maxOutputTokens: 1024,
      }),
    });
    expect((await intent.parse({ input: "查询订单 000123" })).data).toEqual({
      orderId: "000123",
    });
    expect(requests).toHaveLength(2);
    expect(requests[0]!.url).toBe(
      provider === "openai"
        ? "https://api.openai.com/v1/responses"
        : "https://api.x.ai/v1/responses",
    );
    expect(requests[0]!.body).toMatchObject({
      store: false,
      stream: false,
      tools: [],
      max_output_tokens: 1024,
      text: { format: { type: "json_schema", strict: true } },
    });
    expect(requests[1]!.body).toMatchObject({
      text: {
        format: { type: provider === "openai" ? "json_object" : "text" },
      },
    });
    if (provider === "xai")
      expect(requests[0]!.body).toMatchObject({
        input: [{ role: "system" }, { role: "user" }],
      });
    else expect(requests[0]!.body).toHaveProperty("instructions");
    intent.dispose();
  },
);
it.each([
  [401, "MODEL_AUTH_FAILED"],
  [403, "MODEL_AUTH_FAILED"],
  [429, "MODEL_RATE_LIMITED"],
  [500, "MODEL_REQUEST_FAILED"],
] as const)(
  "maps HTTP %i without SDK retries or secret diagnostics",
  async (status, code) => {
    const transport = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            error: { message: "sensitive diagnostic", type: "server_error" },
          }),
          { status, headers: { "content-type": "application/json" } },
        ),
    );
    const intent = new Intent({
      executor: createApiExecutor({
        provider: "openai",
        apiKey: "test-key",
        model: "fixture",
        fetch: transport,
      }),
    });
    await expect(intent.parse({ input: "x" })).rejects.toMatchObject({
      code,
      message: expect.not.stringContaining("sensitive"),
    });
    expect(transport).toHaveBeenCalledTimes(1);
    intent.dispose();
  },
);
it("maps data refusal/incomplete to errors with partialResult", async () => {
  for (const reply of [
    {
      status: "completed",
      output: [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "refusal", refusal: "No" }],
        },
      ],
    },
    { status: "incomplete", output: [] },
  ]) {
    let count = 0;
    const transport: typeof fetch = async () =>
      new Response(JSON.stringify(count++ === 0 ? completed(core()) : reply), {
        headers: { "content-type": "application/json" },
      });
    const intent = new Intent({
      schema: orderSchema,
      executor: createApiExecutor({
        provider: "openai",
        apiKey: "test",
        model: "fixture",
        fetch: transport,
      }),
    });
    await expect(intent.parse({ input: "000123" })).rejects.toMatchObject({
      code:
        reply.status === "incomplete"
          ? "MODEL_OUTPUT_INCOMPLETE"
          : "MODEL_REFUSED",
      stage: "data",
      partialResult: { data: {} },
    });
    intent.dispose();
  }
});
it("uses the real MCP SDK handshake and tools to round trip without a model API", async () => {
  const [serverTransport, clientTransport] =
    InMemoryTransport.createLinkedPair();
  const intent = new Intent({ schema: orderSchema });
  const service = await serveIntentMcp({
    instances: { orders: intent },
    transport: serverTransport,
  });
  const client = new Client({ name: "test-client", version: "1.0" });
  try {
    await client.connect(clientTransport);
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual([
      "intent_prepare",
      "intent_accept",
      "intent_cancel",
    ]);
    const decode = (
      reply: Awaited<ReturnType<Client["callTool"]>>,
    ): BridgeReply => reply.structuredContent as unknown as BridgeReply;
    const first = decode(
      await client.callTool({
        name: "intent_prepare",
        arguments: { instance: "orders", input: "000123" },
      }),
    );
    if (first.kind !== "task") throw new Error("Expected core task");
    const next = decode(
      await client.callTool({
        name: "intent_accept",
        arguments: {
          jobId: first.jobId,
          stepToken: first.stepToken,
          candidateText: JSON.stringify(core()),
        },
      }),
    );
    if (next.kind !== "task") throw new Error("Expected data task");
    expect(
      decode(
        await client.callTool({
          name: "intent_accept",
          arguments: {
            jobId: next.jobId,
            stepToken: next.stepToken,
            candidateText: JSON.stringify(data()),
          },
        }),
      ),
    ).toMatchObject({
      kind: "result",
      result: { data: { orderId: "000123" } },
    });
    const bad = await client.callTool({
      name: "intent_prepare",
      arguments: { instance: "orders", input: " ", unexpected: true },
    });
    expect(bad.isError).toBe(true);
  } finally {
    await client.close();
    await service.close();
    intent.dispose();
  }
});

const responseRequest: ModelRequest = {
  stage: "data",
  instructions: "Fixture instructions",
  payload: "{}",
  format: { kind: "json_object" },
  signal: new AbortController().signal,
};
it.each([
  ["absent response", null, "MODEL_OUTPUT_INVALID"],
  ["failed response", { status: "failed" }, "MODEL_REQUEST_FAILED"],
  ["missing output", { status: "completed" }, "MODEL_OUTPUT_INVALID"],
  [
    "malformed output item",
    { status: "completed", output: [null] },
    "MODEL_OUTPUT_INVALID",
  ],
  [
    "tool output",
    {
      status: "completed",
      output: [{ type: "function_call", name: "delete_database" }],
    },
    "MODEL_OUTPUT_INVALID",
  ],
  [
    "non-assistant message",
    {
      status: "completed",
      output: [{ type: "message", role: "user", content: [] }],
    },
    "MODEL_OUTPUT_INVALID",
  ],
  [
    "missing content",
    { status: "completed", output: [{ type: "message", role: "assistant" }] },
    "MODEL_OUTPUT_INVALID",
  ],
  [
    "malformed content",
    {
      status: "completed",
      output: [{ type: "message", role: "assistant", content: [null] }],
    },
    "MODEL_OUTPUT_INVALID",
  ],
  [
    "unexpected content",
    {
      status: "completed",
      output: [
        { type: "message", role: "assistant", content: [{ type: "image" }] },
      ],
    },
    "MODEL_OUTPUT_INVALID",
  ],
  ["empty final message", { status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: " " }] }] }, "MODEL_OUTPUT_INVALID"],
  [
    "no final message",
    { status: "completed", output: [{ type: "reasoning" }] },
    "MODEL_OUTPUT_INVALID",
  ],
  [
    "two final messages",
    {
      status: "completed",
      output: [...completed(core()).output, ...completed(data()).output],
    },
    "MODEL_OUTPUT_INVALID",
  ],
] as const)("rejects provider %s", (_, response, code) => {
  expect(() => readCompletedResponse(response, responseRequest)).toThrowError(
    expect.objectContaining({ code, stage: "data" }),
  );
});
it("ignores provider reasoning and concatenates text chunks in one final message", () => {
  expect(
    readCompletedResponse(
      {
        status: "completed",
        output: [
          { type: "reasoning", summary: [] },
          {
            type: "message",
            role: "assistant",
            content: [
              { type: "output_text", text: '{"data":' },
              { type: "output_text", text: "{}}" },
            ],
          },
        ],
      },
      responseRequest,
    ),
  ).toEqual({ outcome: "complete", text: '{"data":{}}' });
});
it.each(["openai", "xai"] as const)(
  "refuses %s targets explicitly lacking strict Schema before network access",
  async (provider) => {
    const transport = vi.fn<typeof fetch>();
    const intent = new Intent({
      executor: createApiExecutor({
        provider,
        apiKey: "fixture",
        model: "fixture",
        nativeJsonSchema: false,
        fetch: transport,
      }),
    });
    try {
      await expect(intent.parse({ input: "x" })).rejects.toMatchObject({
        code: "HOST_CAPABILITY_UNSUPPORTED",
        stage: "core",
      });
      expect(transport).not.toHaveBeenCalled();
    } finally {
      intent.dispose();
    }
  },
);
it("refuses executors that cannot abort", () => {
  const executor = fakeExecutor();
  expect(
    () =>
      new Intent({
        executor: {
          ...executor,
          capabilities: { ...executor.capabilities, supportsAbort: false },
        },
      }),
  ).toThrowError(
    expect.objectContaining({
      code: "HOST_CAPABILITY_UNSUPPORTED",
      stage: "config",
    }),
  );
});
it.each([
  [401, "MODEL_AUTH_FAILED"],
  [403, "MODEL_AUTH_FAILED"],
  [429, "MODEL_RATE_LIMITED"],
  [500, "MODEL_REQUEST_FAILED"],
] as const)(
  "retains checked core when data HTTP %i fails",
  async (status, code) => {
    let calls = 0;
    const transport: typeof fetch = async () => {
      calls++;
      return calls === 1
        ? new Response(JSON.stringify(completed(core())), {
            headers: { "content-type": "application/json" },
          })
        : new Response(
            JSON.stringify({
              error: { message: "sensitive provider details" },
            }),
            { status, headers: { "content-type": "application/json" } },
          );
    };
    const intent = new Intent({
      schema: orderSchema,
      executor: createApiExecutor({
        provider: "openai",
        apiKey: "fixture",
        model: "fixture",
        fetch: transport,
      }),
    });
    try {
      await expect(intent.parse({ input: "000123" })).rejects.toMatchObject({
        code,
        stage: "data",
        partialResult: {
          data: {},
          intents: [{ action: "query", status: "ready" }],
        },
        message: expect.not.stringContaining("sensitive"),
      });
      expect(calls).toBe(2);
    } finally {
      intent.dispose();
    }
  },
);
it("maps network failure without retries or provider diagnostics", async () => {
  const transport = vi.fn<typeof fetch>(async () => {
    throw new Error("sensitive network diagnostic");
  });
  const intent = new Intent({
    executor: createApiExecutor({
      provider: "xai",
      apiKey: "fixture",
      model: "fixture",
      fetch: transport,
    }),
  });
  try {
    await expect(intent.parse({ input: "x" })).rejects.toMatchObject({
      code: "MODEL_REQUEST_FAILED",
      stage: "core",
      message: expect.not.stringContaining("sensitive"),
    });
    expect(transport).toHaveBeenCalledTimes(1);
  } finally {
    intent.dispose();
  }
});
