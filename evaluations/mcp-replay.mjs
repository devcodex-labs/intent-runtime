import assert from "node:assert/strict";
import {
  readFileSync,
  mkdirSync,
  appendFileSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { evaluationOutput, externalOutputPath } from "./output.mjs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { loadCases } from "./cases.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = externalOutputPath(process.argv[2]);
const output = evaluationOutput("replay", process.argv[3]);
const manifest = loadCases(process.argv[4]?.split(","));
assert.deepEqual(
  JSON.parse(readFileSync(join(source, "manifest.json"), "utf8")).map((test) => test.key),
  manifest.map((test) => test.key),
  "Source manifest must match the selected dataset.",
);
mkdirSync(output, { recursive: true });
const events = readFileSync(join(source, "transcript.jsonl"), "utf8")
  .trim()
  .split("\n")
  .map(JSON.parse)
  .filter((e) => e.event === "call");
const client = new Client({
  name: "intent-runtime-recorded-candidate-replay",
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
const state = new Map();
let calls = 0;
try {
  await client.connect(transport);
  for (const event of events) {
    const previous = state.get(event.key);
    const args =
      event.tool === "intent_accept"
        ? {
            ...event.arguments,
            jobId: previous.jobId,
            stepToken: previous.stepToken,
          }
        : event.arguments;
    const response = await client.callTool({
      name: event.tool,
      arguments: args,
    });
    const reply = response.structuredContent;
    calls++;
    appendFileSync(
      join(output, "transcript.jsonl"),
      JSON.stringify({
        key: event.key,
        tool: event.tool,
        arguments: args,
        reply,
      }) + "\n",
    );
    assert.equal(reply.kind, event.reply.kind, event.key);
    assert.equal(response.isError ?? false, event.isError, event.key);
    if (reply.kind === "task") {
      assert.equal(reply.stage, event.reply.stage, event.key);
      assert.equal(reply.instructions, event.reply.instructions, event.key);
      assert.deepEqual(
        JSON.parse(reply.payload),
        JSON.parse(event.reply.payload),
        event.key,
      );
      assert.deepEqual(reply.format, event.reply.format, event.key);
    } else assert.deepEqual(reply, event.reply, event.key);
    state.set(event.key, reply);
  }
  assert.deepEqual([...state.keys()], manifest.map((test) => test.key));
  assert.ok(
    [...state.values()].every(
      (reply) => reply.kind === "result" || reply.kind === "error",
    ),
  );
} finally {
  const pid = transport.pid;
  await client.close();
  if (pid)
    assert.throws(
      () => process.kill(pid, 0),
      (error) => error.code === "ESRCH",
    );
}
const summary = {
  node: process.version,
  cases: state.size,
  toolCalls: calls,
  status: "pass",
  candidateSource:
    "replay of recorded candidates; no new inference or semantic review",
  providerApiCalls: 0,
  childProcessExited: true,
};
writeFileSync(
  join(output, "summary.json"),
  JSON.stringify(summary, null, 2) + "\n",
);
console.log(JSON.stringify(summary));
