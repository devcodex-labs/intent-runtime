import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Intent } from "../intent.js";
import type {
  IntentParseRequest,
  IntentResult,
  ModelRequest,
} from "../contracts/public.js";
import { getRuntime } from "../core/config.js";
import { prepareTask } from "../core/input.js";
import {
  acceptCandidate,
  attachPartial,
  nextRequest,
  startPipeline,
  stopPipeline,
} from "../core/pipeline.js";
import type { Pipeline } from "../core/pipeline.js";
import { IntentParseError, asIntentError, fail } from "../errors.js";
import type { SerializedIntentError } from "../errors.js";
import { bytes, isObject, onlyKeys } from "../internal/object.js";
export type BridgeReply =
  | {
      kind: "task";
      jobId: string;
      stepToken: string;
      stage: "core" | "data";
      instructions: string;
      payload: string;
      format: ModelRequest["format"];
      expiresAt: string;
    }
  | { kind: "result"; result: IntentResult }
  | { kind: "error"; error: SerializedIntentError };
export interface BridgeConfig {
  instances: Record<string, Intent>;
  maxJobs?: number;
  jobTtlMs?: number;
  replayTtlMs?: number;
  maxReplayEntries?: number;
  maxReplayBytes?: number;
}
export interface PrepareRequest extends IntentParseRequest {
  instance: string;
}
export interface AcceptRequest {
  jobId: string;
  stepToken: string;
  candidateText: string;
}
export interface CancelRequest {
  jobId: string;
  outcome?: "cancelled" | "refusal" | "incomplete";
  detail?: string;
}
export interface BridgeSession {
  prepare(request: PrepareRequest): BridgeReply;
  accept(request: AcceptRequest): BridgeReply;
  cancel(request: CancelRequest): BridgeReply;
  close(): void;
}
interface Replay {
  digest: string;
  reply: BridgeReply;
}
interface Job {
  id: string;
  owner: symbol;
  state: Pipeline;
  token: string;
  expires: number;
  replays: Map<string, Replay>;
  terminal?: BridgeReply;
  timer: ReturnType<typeof setTimeout>;
}
export function createIntentBridge(config: BridgeConfig): {
  connect(): BridgeSession;
  close(): void;
} {
  if (
    !isObject(config) ||
    !isObject(config.instances) ||
    !Object.keys(config.instances).length
  )
    fail("CONFIG_INVALID", "config", "Bridge needs named Intent instances.");
  onlyKeys(
    config,
    [
      "instances",
      "maxJobs",
      "jobTtlMs",
      "replayTtlMs",
      "maxReplayEntries",
      "maxReplayBytes",
    ],
    "config",
    "CONFIG_INVALID",
  );
  const instances = { ...config.instances } as Record<string, Intent>;
  for (const instance of Object.values(instances)) getRuntime(instance);
  const maxJobs = config.maxJobs ?? 32,
    ttl = config.jobTtlMs ?? 600000,
    replayTtl = config.replayTtlMs ?? 60000;
  const maxReplayEntries = config.maxReplayEntries ?? 128,
    maxReplayBytes = config.maxReplayBytes ?? 8388608;
  if (
    [maxJobs, ttl, replayTtl, maxReplayEntries, maxReplayBytes].some(
      (value) =>
        !Number.isSafeInteger(value) || value <= 0 || value > 2147483647,
    )
  )
    fail("CONFIG_INVALID", "config", "Invalid bridge limits.");
  const jobs = new Map<string, Job>();
  let closed = false;
  const clone = (reply: BridgeReply): BridgeReply => structuredClone(reply);
  const errorReply = (error: unknown): BridgeReply => ({
    kind: "error",
    error: asIntentError(error, "bridge").toJSON(),
  });
  function remove(job: Job): void {
    clearTimeout(job.timer);
    stopPipeline(job.state);
    jobs.delete(job.id);
    job.state.controller.abort();
  }
  function terminal(job: Job, reply: BridgeReply): void {
    if (job.terminal) return;
    stopPipeline(job.state);
    job.terminal = clone(reply);
    clearTimeout(job.timer);
    job.timer = setTimeout(() => remove(job), replayTtl);
    job.timer.unref();
    if (retainedSize() > maxReplayBytes) remove(job);
  }
  function lookup(id: unknown, owner: symbol): Job {
    if (
      typeof id !== "string" ||
      !jobs.has(id) ||
      jobs.get(id)!.owner !== owner
    )
      fail(
        "BRIDGE_JOB_NOT_FOUND",
        "bridge",
        "Job is unavailable in this connection.",
      );
    return jobs.get(id)!;
  }
  function taskReply(job: Job): BridgeReply {
    const request = nextRequest(job.state);
    return {
      kind: "task",
      jobId: job.id,
      stepToken: job.token,
      stage: request.stage,
      instructions: request.instructions,
      payload: request.payload,
      format: request.format,
      expiresAt: new Date(job.expires).toISOString(),
    };
  }
  function retainedSize(): number {
    let size = 0;
    for (const job of jobs.values()) {
      size += bytes(JSON.stringify(job.state.task));
      if (job.state.coreResult)
        size += bytes(JSON.stringify(job.state.coreResult));
      if (job.state.repair) size += bytes(JSON.stringify(job.state.repair));
      if (job.terminal) size += bytes(JSON.stringify(job.terminal));
      for (const replay of job.replays.values())
        size += bytes(JSON.stringify(replay.reply));
    }
    return size;
  }
  const guard = (operation: () => BridgeReply): BridgeReply => {
    try {
      if (closed) fail("BRIDGE_JOB_NOT_FOUND", "bridge", "Bridge is closed.");
      return operation();
    } catch (error) {
      return errorReply(error);
    }
  };
  return {
    connect(): BridgeSession {
      if (closed) fail("BRIDGE_JOB_NOT_FOUND", "bridge", "Bridge is closed.");
      const owner = Symbol();
      let disconnected = false;
      const local = (operation: () => BridgeReply): BridgeReply =>
        guard(() => {
          if (disconnected)
            fail("BRIDGE_JOB_NOT_FOUND", "bridge", "Connection is closed.");
          return operation();
        });
      return {
        prepare(request): BridgeReply {
          return local(() => {
            if (!isObject(request))
              fail("INPUT_INVALID", "input", "Expected prepare request.");
            onlyKeys(
              request,
              ["instance", "input", "fields", "context"],
              "input",
              "INPUT_INVALID",
            );
            if (
              typeof request.instance !== "string" ||
              !Object.hasOwn(instances, request.instance)
            )
              fail("INPUT_INVALID", "input", "Unknown instance.");
            if (
              [...jobs.values()].filter((job) => !job.terminal).length >=
                maxJobs ||
              jobs.size >= maxReplayEntries ||
              retainedSize() >= maxReplayBytes
            )
              fail("LIMIT_EXCEEDED", "bridge", "Bridge capacity exceeded.");
            const runtime = getRuntime(instances[request.instance]!);
            const task = prepareTask(runtime, {
              input: request.input,
              ...(request.fields !== undefined
                ? { fields: request.fields }
                : {}),
              ...(request.context !== undefined
                ? { context: request.context }
                : {}),
            });
            const state = startPipeline(runtime, task);
            const job: Job = {
              id: randomUUID(),
              owner,
              state,
              token: randomBytes(24).toString("base64url"),
              expires: Date.now() + ttl,
              replays: new Map(),
              timer: setTimeout(() => {}, 0),
            };
            clearTimeout(job.timer);
            jobs.set(job.id, job);
            job.timer = setTimeout(() => {
              terminal(
                job,
                errorReply(
                  attachPartial(
                    state,
                    new IntentParseError(
                      "BRIDGE_JOB_EXPIRED",
                      "bridge",
                      "Bridge job expired.",
                    ),
                  ),
                ),
              );
              state.controller.abort();
            }, ttl);
            job.timer.unref();
            state.controller.signal.addEventListener(
              "abort",
              () => {
                if (!job.terminal && jobs.has(job.id))
                  terminal(
                    job,
                    errorReply(
                      attachPartial(
                        state,
                        new IntentParseError(
                          "INSTANCE_DISPOSED",
                          state.stage,
                          "Intent instance was disposed.",
                        ),
                      ),
                    ),
                  );
              },
              { once: true },
            );
            try {
              const reply = taskReply(job);
              if (retainedSize() > maxReplayBytes) {
                remove(job);
                fail(
                  "LIMIT_EXCEEDED",
                  "bridge",
                  "Bridge retained materials exceed byte capacity.",
                );
              }
              return reply;
            } catch (error) {
              const reply = errorReply(
                attachPartial(state, asIntentError(error, state.stage)),
              );
              if (jobs.has(job.id)) terminal(job, reply);
              return reply;
            }
          });
        },
        accept(request): BridgeReply {
          return local(() => {
            if (!isObject(request))
              fail("INPUT_INVALID", "bridge", "Expected accept request.");
            onlyKeys(
              request,
              ["jobId", "stepToken", "candidateText"],
              "bridge",
              "INPUT_INVALID",
            );
            const job = lookup(request.jobId, owner);
            if (
              typeof request.stepToken !== "string" ||
              typeof request.candidateText !== "string"
            )
              fail(
                "INPUT_INVALID",
                "bridge",
                "Token and candidateText must be strings.",
              );
            const digest = createHash("sha256")
              .update(request.candidateText)
              .digest("hex");
            const prior = job.replays.get(request.stepToken);
            if (prior) {
              if (prior.digest !== digest)
                fail(
                  "BRIDGE_STEP_CONFLICT",
                  "bridge",
                  "Token already used with a different candidate.",
                );
              return clone(prior.reply);
            }
            if (job.terminal) {
              if (
                job.terminal.kind === "error" &&
                ["BRIDGE_JOB_EXPIRED", "INSTANCE_DISPOSED"].includes(
                  job.terminal.error.code,
                )
              )
                return clone(job.terminal);
              fail("BRIDGE_STEP_CONFLICT", "bridge", "Job is terminal.");
            }
            if (request.stepToken !== job.token)
              fail(
                "BRIDGE_STEP_CONFLICT",
                "bridge",
                "Step token does not match.",
              );
            let reply: BridgeReply;
            try {
              const result = acceptCandidate(job.state, {
                outcome: "complete",
                text: request.candidateText,
              });
              if (result) {
                reply = { kind: "result", result };
                terminal(job, reply);
              } else {
                job.token = randomBytes(24).toString("base64url");
                reply = taskReply(job);
              }
            } catch (error) {
              reply = errorReply(
                attachPartial(job.state, asIntentError(error, job.state.stage)),
              );
              terminal(job, reply);
            }
            if (
              !jobs.has(job.id) ||
              retainedSize() + bytes(JSON.stringify(reply)) > maxReplayBytes
            ) {
              reply = errorReply(
                attachPartial(
                  job.state,
                  new IntentParseError(
                    "LIMIT_EXCEEDED",
                    "bridge",
                    "Replay byte capacity exceeded.",
                  ),
                ),
              );
              remove(job);
              return reply;
            }
            job.replays.set(request.stepToken, { digest, reply: clone(reply) });
            return clone(reply);
          });
        },
        cancel(request): BridgeReply {
          return local(() => {
            if (!isObject(request))
              fail("INPUT_INVALID", "bridge", "Expected cancel request.");
            onlyKeys(
              request,
              ["jobId", "outcome", "detail"],
              "bridge",
              "INPUT_INVALID",
            );
            const job = lookup(request.jobId, owner);
            if (
              request.outcome !== undefined &&
              !["cancelled", "refusal", "incomplete"].includes(request.outcome)
            )
              fail("INPUT_INVALID", "bridge", "Invalid cancellation outcome.");
            if (
              request.detail !== undefined &&
              (typeof request.detail !== "string" ||
                bytes(request.detail) > 2048)
            )
              fail("INPUT_INVALID", "bridge", "Invalid cancellation detail.");
            if (job.terminal) return clone(job.terminal);
            const code =
              request.outcome === "refusal"
                ? "MODEL_REFUSED"
                : request.outcome === "incomplete"
                  ? "MODEL_OUTPUT_INCOMPLETE"
                  : "MODEL_ABORTED";
            const reply = errorReply(
              attachPartial(
                job.state,
                new IntentParseError(
                  code,
                  job.state.stage,
                  "Host generation ended without a candidate.",
                ),
              ),
            );
            terminal(job, reply);
            job.state.controller.abort();
            if (!jobs.has(job.id))
              return errorReply(
                attachPartial(
                  job.state,
                  new IntentParseError(
                    "LIMIT_EXCEEDED",
                    "bridge",
                    "Terminal retention exceeds byte capacity.",
                  ),
                ),
              );
            return reply;
          });
        },
        close(): void {
          if (disconnected) return;
          disconnected = true;
          for (const job of [...jobs.values()])
            if (job.owner === owner) remove(job);
        },
      };
    },
    close(): void {
      if (closed) return;
      closed = true;
      for (const job of [...jobs.values()]) remove(job);
    },
  };
}
