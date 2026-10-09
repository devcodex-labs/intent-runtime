import assert from "node:assert/strict";
import { mkdirSync, appendFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { evaluationOutput } from "./output.mjs";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = evaluationOutput("protocol", process.argv[2]);
mkdirSync(output, { recursive: true });
const groups = [];
let toolCalls = 0,
  connections = 0;
const log = (value) =>
  appendFileSync(
    join(output, "protocol-transcript.jsonl"),
    JSON.stringify({ time: new Date().toISOString(), ...value }) + "\n",
  );
const schema = {
  type: "object",
  properties: { orderId: { type: "string" } },
  required: ["orderId"],
};
const core = {
  normalizedInput: "Query order 000123.",
  primaryIntent: "Query order",
  requirements: [],
  prohibitions: [],
  intents: [
    {
      action: "query",
      target: "Order 000123",
      requirements: [],
      blockers: {
        clarificationReason: null,
        questions: [],
        confirmationReason: null,
        conditionReason: null,
      },
    },
  ],
};
const data = {
  data: { orderId: "000123" },
  evidence: [
    {
      path: "/data/orderId",
      mode: "exact",
      sources: [{ sourceId: "input", quote: "000123" }],
    },
  ],
  descriptionChecks: [],
  fieldResults: [
    {
      path: "/data/orderId",
      status: "extracted",
      explanation: "Explicit identifier.",
    },
  ],
  issues: [],
};
const err = (reply, code, stage) => {
  assert.equal(reply.kind, "error");
  assert.equal(reply.error.code, code);
  if (stage) assert.equal(reply.error.stage, stage);
};
const task = (reply) => {
  assert.equal(reply.kind, "task");
  return reply;
};
async function connect(options = {}) {
  const client = new Client({
    name: "intent-runtime-protocol-check",
    version: "1",
  });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      join(root, "evaluations/mcp-protocol-server.mjs"),
      JSON.stringify(options),
    ],
    cwd: root,
    stderr: "pipe",
  });
  await client.connect(transport);
  connections++;
  log({
    event: "connected",
    pid: transport.pid,
    options,
    server: client.getServerVersion(),
  });
  let stderr = "";
  transport.stderr?.on("data", (value) => {
    stderr += value;
  });
  return {
    client,
    async call(name, args) {
      const response = await client.callTool({ name, arguments: args });
      toolCalls++;
      const reply = response.structuredContent;
      log({ event: "call", name, args, response });
      assert.ok(reply);
      assert.deepEqual(JSON.parse(response.content[0].text), reply);
      assert.equal(response.isError, reply.kind === "error");
      return reply;
    },
    async close() {
      const pid = transport.pid;
      await client.close();
      if (pid)
        assert.throws(
          () => process.kill(pid, 0),
          (error) => error.code === "ESRCH",
        );
      assert.equal(stderr, "");
      log({
        event: "closed",
        pid,
        childProcessExited: true,
        stderrEmpty: true,
      });
    },
  };
}
const prepare = (c, extra = {}) =>
  c.call("intent_prepare", {
    instance: "test",
    input: "Query order 000123.",
    ...extra,
  });
const accept = (c, t, value) =>
  c.call("intent_accept", {
    jobId: t.jobId,
    stepToken: t.stepToken,
    candidateText: typeof value === "string" ? value : JSON.stringify(value),
  });
async function group(name, options, run) {
  const started = Date.now();
  let c;
  try {
    c = await connect(options);
    await run(c);
    groups.push({ name, status: "pass", durationMs: Date.now() - started });
  } catch (error) {
    groups.push({
      name,
      status: "fail",
      message: error.message,
      durationMs: Date.now() - started,
    });
    process.exitCode = 1;
  } finally {
    if (c)
      try {
        await c.close();
      } catch (error) {
        groups.push({
          name: name + " / cleanup",
          status: "fail",
          message: error.message,
        });
        process.exitCode = 1;
      }
  }
  log({ event: "group", ...groups.at(-1) });
  console.log(JSON.stringify(groups.at(-1)));
}
await group("工具握手、严格入参、未知工具/实例/字段", {}, async (c) => {
  assert.deepEqual(
    (await c.client.listTools()).tools.map((t) => t.name),
    ["intent_prepare", "intent_accept", "intent_cancel"],
  );
  for (const args of [
    { instance: "missing", input: "x" },
    { instance: "test", input: " " },
    { instance: "test", input: 1 },
    { instance: "test", input: "x", extra: true },
    { instance: "test", input: "x", fields: null },
    { instance: "test", input: "x", context: null },
    {
      instance: "test",
      input: "x",
      context: [{ role: "system", content: "x" }],
    },
  ])
    err(await c.call("intent_prepare", args), "INPUT_INVALID");
  err(await c.call("missing_tool", {}), "INPUT_INVALID");
  err(await prepare(c, { fields: ["missing"] }), "UNKNOWN_FIELD");
});
await group(
  "两阶段、核心与终态重放、不同候选冲突",
  { instance: { schema } },
  async (c) => {
    const t = task(await prepare(c)),
      d = task(await accept(c, t, core));
    assert.equal(d.stage, "data");
    assert.deepEqual(await accept(c, t, core), d);
    err(await accept(c, t, {}), "BRIDGE_STEP_CONFLICT");
    const result = await accept(c, d, data);
    assert.equal(result.kind, "result");
    assert.deepEqual(result.result.data, { orderId: "000123" });
    assert.deepEqual(await accept(c, d, data), result);
    err(await accept(c, d, {}), "BRIDGE_STEP_CONFLICT");
    assert.deepEqual(await c.call("intent_cancel", { jobId: d.jobId }), result);
  },
);
await group("令牌伪造与跨进程隔离", {}, async (c) => {
  const t = task(await prepare(c));
  err(
    await accept(c, { ...t, stepToken: "forged" }, core),
    "BRIDGE_STEP_CONFLICT",
  );
  const other = await connect();
  try {
    err(await accept(other, t, core), "BRIDGE_JOB_NOT_FOUND");
  } finally {
    await other.close();
  }
  err(
    await c.call("intent_accept", {
      jobId: t.jobId,
      stepToken: t.stepToken,
      candidateText: 1,
    }),
    "INPUT_INVALID",
  );
  assert.equal((await accept(c, t, core)).kind, "result");
});
await group(
  "并发提交同一令牌只推进一次",
  { instance: { schema } },
  async (c) => {
    const t = task(await prepare(c));
    const replies = await Promise.all([accept(c, t, core), accept(c, t, core)]);
    assert.deepEqual(replies[0], replies[1]);
    assert.equal((await accept(c, task(replies[0]), data)).kind, "result");
  },
);
await group("核心单次修复、再次失败终止、无 partialResult", {}, async (c) => {
  const t = task(await prepare(c)),
    r = task(await accept(c, t, "{bad"));
  assert.notEqual(t.stepToken, r.stepToken);
  assert.ok(JSON.parse(r.payload).repair);
  const failed = await accept(c, r, "{bad");
  err(failed, "MODEL_OUTPUT_INVALID", "core");
  assert.equal(failed.error.partialResult, undefined);
  const t2 = task(await prepare(c));
  const r2 = task(await accept(c, t2, "{bad"));
  assert.equal((await accept(c, r2, core)).kind, "result");
});
await group(
  "关闭修复后立即失败",
  { instance: { repairAttempts: 0 } },
  async (c) => {
    err(
      await accept(c, task(await prepare(c)), "{bad"),
      "MODEL_OUTPUT_INVALID",
      "core",
    );
  },
);
await group(
  "数据来源错误修复、再次失败保留核心",
  { instance: { schema } },
  async (c) => {
    const d = task(await accept(c, task(await prepare(c)), core));
    const bad = structuredClone(data);
    bad.evidence[0].sources[0].quote = "invented";
    const repair = task(await accept(c, d, bad));
    assert.equal(repair.stage, "data");
    const failed = await accept(c, repair, bad);
    err(failed, "MODEL_OUTPUT_INVALID", "data");
    assert.deepEqual(failed.error.partialResult.data, {});
    assert.equal(failed.error.partialResult.intents[0].action, "query");
  },
);
await group(
  "取消/拒绝/未完成在核心与数据阶段的六种组合",
  { instance: { schema } },
  async (c) => {
    for (const stage of ["core", "data"])
      for (const [outcome, code] of [
        ["cancelled", "MODEL_ABORTED"],
        ["refusal", "MODEL_REFUSED"],
        ["incomplete", "MODEL_OUTPUT_INCOMPLETE"],
      ]) {
        let t = task(await prepare(c));
        if (stage === "data") t = task(await accept(c, t, core));
        const r = await c.call("intent_cancel", { jobId: t.jobId, outcome });
        err(r, code, stage);
        assert.equal(Boolean(r.error.partialResult), stage === "data");
        assert.deepEqual(await c.call("intent_cancel", { jobId: t.jobId }), r);
      }
    const t = task(await prepare(c));
    err(
      await c.call("intent_cancel", { jobId: t.jobId, outcome: "invalid" }),
      "INPUT_INVALID",
    );
    err(
      await c.call("intent_cancel", {
        jobId: t.jobId,
        detail: "中".repeat(700),
      }),
      "INPUT_INVALID",
    );
    err(
      await c.call("intent_cancel", { jobId: t.jobId }),
      "MODEL_ABORTED",
      "core",
    );
  },
);
await group("默认32个活动任务容量", {}, async (c) => {
  const tasks = [];
  for (let i = 0; i < 32; i++) tasks.push(task(await prepare(c)));
  err(await prepare(c), "LIMIT_EXCEEDED", "bridge");
  for (const t of tasks) await c.call("intent_cancel", { jobId: t.jobId });
  assert.equal((await prepare(c)).kind, "task");
});
await group("默认128个活动和终态任务合计容量", {}, async (c) => {
  for (let i = 0; i < 128; i++)
    assert.equal(
      (await accept(c, task(await prepare(c)), core)).kind,
      "result",
    );
  err(await prepare(c), "LIMIT_EXCEEDED", "bridge");
});
await group(
  "初始材料超过重放字节预算不会保留任务",
  { bridge: { maxReplayBytes: 16 } },
  async (c) => {
    err(await prepare(c), "LIMIT_EXCEEDED", "bridge");
    err(await prepare(c), "LIMIT_EXCEEDED", "bridge");
  },
);
await group(
  "阶段重放超出字节预算保留活跃任务",
  { instance: { schema }, bridge: { maxReplayBytes: 1024 } },
  async (c) => {
    const t = task(await prepare(c));
    err(await accept(c, t, core), "LIMIT_EXCEEDED", "bridge");
    err(await c.call("intent_cancel", { jobId: t.jobId }), "MODEL_ABORTED");
    task(await prepare(c));
  },
);
for (const stage of ["core", "data"])
  await group(
    stage + "阶段过期与终态保留清理",
    { instance: { schema }, bridge: { jobTtlMs: 150, replayTtlMs: 300 } },
    async (c) => {
      let t = task(await prepare(c));
      if (stage === "data") t = task(await accept(c, t, core));
      await delay(190);
      const r = await accept(c, t, core);
      err(r, "BRIDGE_JOB_EXPIRED", "bridge");
      assert.equal(Boolean(r.error.partialResult), stage === "data");
      await delay(310);
      err(
        await c.call("intent_cancel", { jobId: t.jobId }),
        "BRIDGE_JOB_NOT_FOUND",
      );
    },
  );
await group(
  "输出字节限制在核心/数据阶段终止",
  { instance: { schema, limits: { maxOutputBytes: 1024 } } },
  async (c) => {
    const large = "x".repeat(1025);
    err(
      await accept(c, task(await prepare(c)), large),
      "LIMIT_EXCEEDED",
      "core",
    );
    const d = task(await accept(c, task(await prepare(c)), core));
    const r = await accept(c, d, large);
    err(r, "LIMIT_EXCEEDED", "data");
    assert.deepEqual(r.error.partialResult.data, {});
  },
);
await group(
  "JSON非法类型/重复键/精度/深度及畸形括号",
  { instance: { repairAttempts: 0 } },
  async (c) => {
    for (const candidate of [
      "[]",
      '{"a":1,}',
      '{/*comment*/"a":1}',
      '{"a":1} trailing',
      '{"a":1,"\\u0061":2}',
      '{"a":9007199254740993}',
      '{"a":0.10000000000000001}',
      '{"a":1e400}',
      '{"a":' +
        "]".repeat(10000) +
        ',"x":' +
        "[".repeat(10000) +
        "0" +
        "]".repeat(10000) +
        "}",
    ])
      err(
        await accept(c, task(await prepare(c)), candidate),
        "MODEL_OUTPUT_INVALID",
        "core",
      );
    err(
      await accept(
        c,
        task(await prepare(c)),
        '{"x":' + "[".repeat(10000) + "0" + "]".repeat(10000) + "}",
      ),
      "LIMIT_EXCEEDED",
      "core",
    );
  },
);
await group(
  "可空值有明确证据、可选缺失不填空值",
  {
    instance: {
      schema: {
        type: "object",
        properties: {
          note: { type: ["string", "null"] },
          optional: { type: "string" },
        },
        required: ["note"],
      },
    },
  },
  async (c) => {
    const d = task(
      await accept(
        c,
        task(
          await prepare(c, {
            input: "Query order 000123. note explicitly null.",
          }),
        ),
        core,
      ),
    );
    const candidate = {
      data: { note: null },
      evidence: [
        {
          path: "/data/note",
          mode: "semantic",
          sources: [{ sourceId: "input", quote: "note explicitly null" }],
        },
      ],
      descriptionChecks: [],
      fieldResults: [
        {
          path: "/data/note",
          status: "extracted",
          explanation: "Explicit empty value.",
        },
        {
          path: "/data/optional",
          status: "not_provided",
          explanation: "No value supplied.",
        },
      ],
      issues: [],
    };
    assert.deepEqual((await accept(c, d, candidate)).result.data, {
      note: null,
    });
  },
);
await group(
  "真实业务问题直接失败，不生成修复任务",
  {
    instance: {
      schema: {
        type: "object",
        properties: { amount: { type: "number" } },
        required: ["amount"],
      },
    },
  },
  async (c) => {
    const d = task(
      await accept(
        c,
        task(await prepare(c, { input: "Query amount 9007199254740993." })),
        core,
      ),
    );
    const r = await accept(c, d, {
      data: {},
      evidence: [],
      descriptionChecks: [],
      fieldResults: [
        {
          path: "/data/amount",
          status: "issue",
          explanation: "True value exceeds safe representation.",
        },
      ],
      issues: [
        {
          code: "DATA_VALUE_UNREPRESENTABLE",
          category: "definition",
          path: "/data/amount",
          message: "The actual integer cannot be represented safely.",
        },
      ],
    });
    err(r, "DATA_EXTRACTION_FAILED", "data");
    assert.equal(r.error.issues[0].code, "DATA_VALUE_UNREPRESENTABLE");
    assert.deepEqual(r.error.partialResult.data, {});
  },
);
const summary = {
  node: process.version,
  candidateSource: "controlled protocol fixtures, not model inference",
  providerApiCalls: 0,
  groups: groups.length,
  passed: groups.filter((x) => x.status === "pass").length,
  failed: groups.filter((x) => x.status === "fail").length,
  toolCalls,
  connections,
  entries: groups,
};
writeFileSync(
  join(output, "protocol-summary.json"),
  JSON.stringify(summary, null, 2) + "\n",
);
console.log(JSON.stringify(summary));
