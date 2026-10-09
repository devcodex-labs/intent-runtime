import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createInterface } from "node:readline";
import {
  mkdirSync,
  appendFileSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { evaluationOutput } from "./output.mjs";
import { loadCases, instanceName } from "./cases.mjs";
import { SCHEMA_PRESETS } from "./schemas.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const output = evaluationOutput("cloud-mcp", process.argv[2]);
mkdirSync(output, { recursive: true });
const cases = loadCases(process.argv[3]?.split(","));
const state = new Map(
  cases.map((test) => [test.key, { test, calls: [], review: null }]),
);
const transcript = join(output, "transcript.jsonl");
if (
  readFileSync(new URL("../package.json", import.meta.url), "utf8").includes(
    '"version": "0.1.0"',
  )
)
  throw new Error("Wrong baseline.");
const client = new Client({
  name: "intent-runtime-complete-cloud-evaluation",
  version: "1",
});
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [
    join(root, "dist/transports/mcp/main.js"),
    "--config",
    join(root, "evaluations/mcp-config.mjs"),
  ],
  cwd: root,
  stderr: "pipe",
});
function record(value) {
  const event = { time: new Date().toISOString(), ...value };
  appendFileSync(transcript, JSON.stringify(event) + "\n");
  if (event.reply?.kind === "task") {
    const { instructions, format, ...reply } = event.reply;
    console.log(
      JSON.stringify({
        ...event,
        reply: {
          ...reply,
          payload: JSON.parse(reply.payload),
          format: format.kind,
          instructionsSha256: createHash("sha256")
            .update(instructions)
            .digest("hex"),
        },
      }),
    );
  } else console.log(JSON.stringify(event));
}
function summary() {
  const entries = [...state.values()].map((item) => ({
    key: item.test.key,
    dataset: item.test.dataset,
    test: item.test,
    schema: SCHEMA_PRESETS[item.test.schemaPreset] ?? null,
    executed: item.calls.length > 0,
    completed: item.reply?.kind === "result" || item.reply?.kind === "error",
    calls: item.calls.length,
    final: item.reply ?? null,
    selfReview: item.review,
    independentReview: "pending",
  }));
  return {
    candidateGenerator:
      "current conversation assistant via interactive MCP SDK client",
    providerApiCalls: 0,
    nativeDesktopUsed: false,
    node: process.version,
    cases: entries.length,
    completed: entries.filter((item) => item.completed).length,
    reviewed: entries.filter((item) => item.selfReview).length,
    failed: entries.filter((item) => item.selfReview?.status === "fail").length,
    toolCalls: entries.reduce((n, item) => n + item.calls, 0),
    entries,
  };
}
function save() {
  writeFileSync(
    join(output, "summary.json"),
    JSON.stringify(summary(), null, 2) + "\n",
  );
}
async function call(key, name, args, candidateSource) {
  const item = state.get(key);
  if (!item) throw new Error("Unknown case key: " + key);
  const start = Date.now();
  const response = await client.callTool({ name, arguments: args });
  const event = {
    event: "call",
    key,
    tool: name,
    arguments: args,
    reply: response.structuredContent,
    isError: response.isError ?? false,
    durationMs: Date.now() - start,
    ...(candidateSource ? { candidateSource } : {}),
  };
  if (name === "intent_accept")
    event.candidateSha256 = createHash("sha256")
      .update(args.candidateText)
      .digest("hex");
  item.calls.push(event);
  item.reply = event.reply;
  record(event);
  save();
}
let closed = false;
async function close() {
  if (closed) return;
  closed = true;
  const pid = transport.pid;
  await client.close();
  let exited = true;
  if (pid)
    try {
      process.kill(pid, 0);
      exited = false;
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  record({ event: "closed", childPid: pid, childProcessExited: exited });
  save();
  if (!exited) throw new Error("MCP child process remains alive.");
}
try {
  await client.connect(transport);
  record({
    event: "connected",
    output,
    node: process.version,
    childPid: transport.pid,
    server: client.getServerVersion(),
    tools: (await client.listTools()).tools.map((item) => item.name),
    manifest: cases.map((item) => ({
      key: item.key,
      schemaPreset: item.schemaPreset,
      language: item.language,
    })),
  });
  writeFileSync(
    join(output, "manifest.json"),
    JSON.stringify(cases, null, 2) + "\n",
  );
  const input = createInterface({ input: process.stdin, terminal: false });
  for await (const line of input) {
    if (!line.trim()) continue;
    try {
      const command = JSON.parse(line);
      if (command.operation === "close") {
        await close();
        input.close();
        break;
      }
      if (command.operation === "prepare")
        for (const key of command.keys) {
          const item = state.get(key);
          if (!item || item.calls.length)
            throw new Error("Unknown or already prepared case: " + key);
          const test = item.test;
          await call(key, "intent_prepare", {
            instance: instanceName(test),
            input: test.input,
            ...(test.fields !== undefined ? { fields: test.fields } : {}),
            ...(test.context !== undefined ? { context: test.context } : {}),
          });
        }
      else if (command.operation === "accept")
        for (const submission of command.submissions) {
          const item = state.get(submission.key);
          if (!item || item.reply?.kind !== "task")
            throw new Error("Case has no active task: " + submission.key);
          const task = item.reply;
          await call(
            submission.key,
            "intent_accept",
            {
              jobId: task.jobId,
              stepToken: task.stepToken,
              candidateText:
                submission.candidateText ??
                JSON.stringify(submission.candidate),
            },
            submission.candidateSource ?? "current conversation assistant",
          );
        }
      else if (command.operation === "review")
        for (const review of command.reviews) {
          const item = state.get(review.key);
          if (
            !item ||
            !["result", "error"].includes(item.reply?.kind) ||
            !["pass", "fail"].includes(review.status) ||
            !review.reason?.trim()
          )
            throw new Error("Review requires a completed case and a reason.");
          item.review = {
            ...review,
            reviewer: "same current conversation assistant",
            independent: false,
          };
          record({ event: "self-review", ...item.review });
          save();
        }
      else if (command.operation === "summary") {
        const value = summary();
        record({
          event: "summary",
          cases: value.cases,
          completed: value.completed,
          reviewed: value.reviewed,
          failed: value.failed,
          toolCalls: value.toolCalls,
        });
      } else if (
        command.operation !== "prepare" &&
        command.operation !== "accept" &&
        command.operation !== "review"
      )
        throw new Error("Unknown operation.");
    } catch (error) {
      record({ event: "controller-error", message: error.message });
      process.exitCode = 1;
    }
  }
} finally {
  await close();
}
