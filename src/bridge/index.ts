import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Intent } from "../intent.js";
import type { IntentParseRequest, IntentResult, ModelRequest } from "../contracts/public.js";
import { getRuntime } from "../core/config.js";
import { prepareTask } from "../core/input.js";
import { acceptCandidate, attachPartial, nextRequest, startPipeline, stopPipeline } from "../core/pipeline.js";
import type { Pipeline } from "../core/pipeline.js";
import { IntentParseError, asIntentError, fail } from "../errors.js";
import type { SerializedIntentError } from "../errors.js";
import { bytes, isObject, onlyKeys } from "../internal/object.js";

export type BridgeReply =
  | { kind: "task"; jobId: string; stepToken: string; stage: "core" | "data"; instructions: string; payload: string; format: ModelRequest["format"]; expiresAt?: string }
  | { kind: "result"; result: IntentResult }
  | { kind: "error"; error: SerializedIntentError };
export interface BridgeConfig {
  instances: Record<string, Intent>;
  maxJobs?: number;
  /** Optional idle lifetime. Omitted or zero disables expiration. */
  jobTtlMs?: number;
  /** Optional completed-reply lifetime. Omitted or zero uses capacity only. */
  replayTtlMs?: number;
  maxReplayEntries?: number;
  maxReplayBytes?: number;
}
export interface PrepareRequest extends IntentParseRequest { instance: string }
export interface AcceptRequest { jobId: string; stepToken: string; candidateText: string }
export interface CancelRequest { jobId: string; outcome?: "cancelled" | "refusal" | "incomplete"; detail?: string }
export interface BridgeSession {
  prepare(request: PrepareRequest): BridgeReply;
  accept(request: AcceptRequest): Promise<BridgeReply>;
  cancel(request: CancelRequest): BridgeReply;
  close(): void;
}
interface Replay { digest: string; reply: BridgeReply }
interface Job {
  id: string; owner: symbol; state: Pipeline; token: string;
  expires: number | undefined; deadline: number | undefined; replayDeadline: number | undefined;
  replays: Map<string, Replay>; terminal: BridgeReply | undefined;
  timer: ReturnType<typeof setTimeout> | undefined;
  pending: { token: string; digest: string; promise: Promise<BridgeReply> } | undefined;
}
export function createIntentBridge(config: BridgeConfig): { connect(): BridgeSession; close(): void } {
  if (!isObject(config) || !isObject(config.instances) || !Object.keys(config.instances).length)
    fail("CONFIG_INVALID", "config", "Bridge needs named Intent instances.");
  onlyKeys(config, ["instances", "maxJobs", "jobTtlMs", "replayTtlMs", "maxReplayEntries", "maxReplayBytes"], "config", "CONFIG_INVALID");
  const instances = { ...config.instances } as Record<string, Intent>;
  for (const instance of Object.values(instances)) getRuntime(instance);
  const maxJobs = config.maxJobs ?? 32, ttl = config.jobTtlMs ?? 0, replayTtl = config.replayTtlMs ?? 0;
  const maxReplayEntries = config.maxReplayEntries ?? 128, maxReplayBytes = config.maxReplayBytes ?? 8388608;
  if ([maxJobs, maxReplayEntries, maxReplayBytes].some(value => !Number.isSafeInteger(value) || value <= 0 || value > 2147483647)
    || [ttl, replayTtl].some(value => !Number.isSafeInteger(value) || value < 0 || value > 2147483647))
    fail("CONFIG_INVALID", "config", "Invalid bridge limits.");
  const jobs = new Map<string, Job>();
  let closed = false;
  const clone = (reply: BridgeReply): BridgeReply => structuredClone(reply);
  const errorReply = (error: unknown): BridgeReply => ({ kind: "error", error: asIntentError(error, "bridge").toJSON() });
  const limit = (state?: Pipeline): BridgeReply => errorReply(state
    ? attachPartial(state, new IntentParseError("LIMIT_EXCEEDED", "bridge", "Submission exceeds retained capacity; the active job and token are unchanged."))
    : new IntentParseError("LIMIT_EXCEEDED", "bridge", "Bridge capacity exceeded."));
  function remove(job: Job): void {
    clearTimeout(job.timer);
    jobs.delete(job.id);
    stopPipeline(job.state);
    job.state.controller.abort(new IntentParseError("MODEL_ABORTED", job.state.stage, "Connection or retained job closed."));
  }
  function jobSize(job: Job): number {
    let size = bytes(JSON.stringify(job.state.task));
    if (job.state.coreResult) size += bytes(JSON.stringify(job.state.coreResult));
    if (job.state.repair) size += bytes(JSON.stringify(job.state.repair));
    if (job.terminal) size += bytes(JSON.stringify(job.terminal));
    for (const replay of job.replays.values()) size += bytes(JSON.stringify(replay.reply));
    return size;
  }
  function room(extraEntries: number, extraBytes: number, protectedJob?: Job): boolean {
    while (jobs.size + extraEntries > maxReplayEntries || [...jobs.values()].reduce((sum, job) => sum + jobSize(job), 0) + extraBytes > maxReplayBytes) {
      const victim = [...jobs.values()].find(job => job.terminal && job !== protectedJob);
      if (!victim) return false;
      remove(victim);
    }
    return true;
  }
  function terminal(job: Job, reply: BridgeReply): void {
    if (job.terminal) return;
    stopPipeline(job.state);
    job.terminal = clone(reply);
    clearTimeout(job.timer);
    job.timer = undefined;
    if (replayTtl) {
      job.replayDeadline = performance.now() + replayTtl;
      job.timer = setTimeout(() => remove(job), replayTtl);
      job.timer.unref();
    }
    if (!room(0, 0, job)) remove(job); // Only completed records are reclaimable.
  }
  function expire(job: Job): void {
    if (job.terminal) return;
    const error = attachPartial(job.state, new IntentParseError("BRIDGE_JOB_EXPIRED", "bridge", "Configured idle lifetime exceeded."));
    terminal(job, errorReply(error));
    job.state.controller.abort(error);
  }
  function arm(job: Job): void {
    clearTimeout(job.timer);
    job.timer = undefined;
    if (ttl) {
      job.deadline = performance.now() + ttl;
      job.expires = Date.now() + ttl;
      job.timer = setTimeout(() => expire(job), ttl);
      job.timer.unref();
    }
  }
  function lookup(id: unknown, owner: symbol): Job {
    if (typeof id !== "string" || !jobs.has(id) || jobs.get(id)!.owner !== owner)
      fail("BRIDGE_JOB_NOT_FOUND", "bridge", "Job is unavailable in this connection.");
    const job = jobs.get(id)!;
    if (job.terminal && job.replayDeadline !== undefined && performance.now() >= job.replayDeadline) {
      remove(job);
      fail("BRIDGE_JOB_NOT_FOUND", "bridge", "Configured reply retention ended.");
    }
    if (!job.terminal && job.deadline !== undefined && performance.now() >= job.deadline) expire(job);
    if (job.terminal) { jobs.delete(job.id); jobs.set(job.id, job); }
    return job;
  }
  function taskReply(job: Job): BridgeReply {
    const request = nextRequest(job.state);
    return { kind: "task", jobId: job.id, stepToken: job.token, stage: request.stage,
      instructions: request.instructions, payload: request.payload, format: request.format,
      ...(job.expires !== undefined ? { expiresAt: new Date(job.expires).toISOString() } : {}) };
  }
  async function advance(job: Job, request: AcceptRequest, digest: string): Promise<BridgeReply> {
    const controller = new AbortController();
    const forwardAbort = () => controller.abort(job.state.controller.signal.reason);
    job.state.controller.signal.addEventListener("abort", forwardAbort, { once: true });
    if (job.state.controller.signal.aborted) forwardAbort();
    // Stage privately: a rejected capacity change must not consume the token,
    // commit a core result, or remove the original controller from its runtime.
    const staged: Pipeline = { ...job.state, controller };
    let reply: BridgeReply, final = false;
    const token = randomBytes(24).toString("base64url");
    const expires = ttl ? Date.now() + ttl : undefined;
    try {
      try {
        const result = await acceptCandidate(staged, { outcome: "complete", text: request.candidateText });
        if (result) { reply = { kind: "result", result }; final = true; }
        else reply = taskReply({ ...job, state: staged, token, expires });
      } catch (error) {
        reply = errorReply(attachPartial(staged, asIntentError(error, staged.stage)));
        final = true;
      }
      if (!jobs.has(job.id)) return errorReply(new IntentParseError("BRIDGE_JOB_NOT_FOUND", "bridge", "Connection or job closed during validation."));
      if (!job.terminal && job.deadline !== undefined && performance.now() >= job.deadline) expire(job);
      if (job.terminal) return clone(job.terminal);
      const replays = new Map(job.replays);
      replays.set(request.stepToken, { digest, reply: clone(reply) });
      const proposed: Job = { ...job, state: staged, replays, terminal: final ? reply : undefined };
      if (!room(0, jobSize(proposed) - jobSize(job), job)) return limit(job.state);
      job.state.stage = staged.stage;
      job.state.repairs = staged.repairs;
      if (staged.coreResult) job.state.coreResult = staged.coreResult; else delete job.state.coreResult;
      if (staged.repair) job.state.repair = staged.repair; else delete job.state.repair;
      job.token = token;
      job.replays = replays;
      if (final) terminal(job, reply);
      else arm(job);
      return clone(reply);
    } finally {
      job.state.controller.signal.removeEventListener("abort", forwardAbort);
    }
  }
  return {
    connect(): BridgeSession {
      if (closed) fail("BRIDGE_JOB_NOT_FOUND", "bridge", "Bridge is closed.");
      const owner = Symbol();
      let disconnected = false;
      const checkOpen = () => { if (closed || disconnected) fail("BRIDGE_JOB_NOT_FOUND", "bridge", "Connection is closed."); };
      const local = (operation: () => BridgeReply): BridgeReply => { try { checkOpen(); return operation(); } catch (error) { return errorReply(error); } };
      return {
        prepare(request): BridgeReply {
          return local(() => {
            if (!isObject(request)) fail("INPUT_INVALID", "input", "Expected prepare request.");
            onlyKeys(request, ["instance", "input", "fields", "context"], "input", "INPUT_INVALID");
            if (typeof request.instance !== "string" || !Object.hasOwn(instances, request.instance))
              fail("INPUT_INVALID", "input", "Unknown instance.");
            if ([...jobs.values()].filter(job => !job.terminal).length >= maxJobs) return limit();
            const runtime = getRuntime(instances[request.instance]!);
            const task = prepareTask(runtime, { input: request.input,
              ...(request.fields !== undefined ? { fields: request.fields } : {}),
              ...(request.context !== undefined ? { context: request.context } : {}) });
            if (!room(1, bytes(JSON.stringify(task)))) return limit();
            const state = startPipeline(runtime, task);
            const job: Job = { id: randomUUID(), owner, state, token: randomBytes(24).toString("base64url"),
              expires: ttl ? Date.now() + ttl : undefined, deadline: undefined, replayDeadline: undefined,
              replays: new Map(), terminal: undefined, timer: undefined, pending: undefined };
            try {
              const reply = taskReply(job);
              jobs.set(job.id, job);
              arm(job);
              state.controller.signal.addEventListener("abort", () => {
                if (!job.terminal && jobs.has(job.id)) {
                  const reason = asIntentError(state.controller.signal.reason, state.stage);
                  const error = reason.code === "INSTANCE_DISPOSED"
                    ? new IntentParseError(reason.code, state.stage, reason.message, reason.issues)
                    : reason;
                  terminal(job, errorReply(attachPartial(state, error)));
                }
              }, { once: true });
              return reply;
            } catch (error) {
              remove(job);
              return errorReply(attachPartial(state, asIntentError(error, state.stage)));
            }
          });
        },
        async accept(request): Promise<BridgeReply> {
          try {
            checkOpen();
            if (!isObject(request)) fail("INPUT_INVALID", "bridge", "Expected accept request.");
            onlyKeys(request, ["jobId", "stepToken", "candidateText"], "bridge", "INPUT_INVALID");
            const job = lookup(request.jobId, owner);
            if (typeof request.stepToken !== "string" || typeof request.candidateText !== "string")
              fail("INPUT_INVALID", "bridge", "Token and candidateText must be strings.");
            request = { jobId: job.id, stepToken: request.stepToken, candidateText: request.candidateText };
            if (job.terminal?.kind === "error" && ["BRIDGE_JOB_EXPIRED", "INSTANCE_DISPOSED"].includes(job.terminal.error.code))
              return clone(job.terminal);
            if (bytes(request.candidateText) > job.state.runtime.limits.maxOutputBytes)
              return errorReply(attachPartial(job.state, new IntentParseError("LIMIT_EXCEEDED", job.state.stage, "Candidate exceeds maxOutputBytes; the active job and token are unchanged.")));
            const digest = createHash("sha256").update(request.candidateText).digest("hex");
            const prior = job.replays.get(request.stepToken);
            if (prior) {
              if (prior.digest !== digest) fail("BRIDGE_STEP_CONFLICT", "bridge", "Token already used with a different candidate.");
              return clone(prior.reply);
            }
            if (job.terminal || request.stepToken !== job.token)
              fail("BRIDGE_STEP_CONFLICT", "bridge", "Job is terminal or step token does not match.");
            if (job.pending) {
              if (job.pending.token !== request.stepToken || job.pending.digest !== digest)
                fail("BRIDGE_STEP_CONFLICT", "bridge", "A different submission is already in progress.");
              return clone(await job.pending.promise);
            }
            const pending = { token: request.stepToken, digest, promise: Promise.resolve().then(() => advance(job, request, digest)) };
            job.pending = pending;
            try { return clone(await pending.promise); }
            finally { if (job.pending === pending) job.pending = undefined; }
          } catch (error) { return errorReply(error); }
        },
        cancel(request): BridgeReply {
          return local(() => {
            if (!isObject(request)) fail("INPUT_INVALID", "bridge", "Expected cancel request.");
            onlyKeys(request, ["jobId", "outcome", "detail"], "bridge", "INPUT_INVALID");
            const job = lookup(request.jobId, owner);
            if (request.outcome !== undefined && !["cancelled", "refusal", "incomplete"].includes(request.outcome))
              fail("INPUT_INVALID", "bridge", "Invalid cancellation outcome.");
            if (request.detail !== undefined && (typeof request.detail !== "string" || bytes(request.detail) > 2048))
              fail("INPUT_INVALID", "bridge", "Invalid cancellation detail.");
            if (job.terminal) return clone(job.terminal);
            const code = request.outcome === "refusal" ? "MODEL_REFUSED" : request.outcome === "incomplete" ? "MODEL_OUTPUT_INCOMPLETE" : "MODEL_ABORTED";
            const error = attachPartial(job.state, new IntentParseError(code, job.state.stage, "Host generation ended without a candidate."));
            const reply = errorReply(error);
            terminal(job, reply);
            job.state.controller.abort(error);
            return clone(reply);
          });
        },
        close(): void { if (disconnected) return; disconnected = true; for (const job of [...jobs.values()]) if (job.owner === owner) remove(job); },
      };
    },
    close(): void { if (closed) return; closed = true; for (const job of [...jobs.values()]) remove(job); },
  };
}
