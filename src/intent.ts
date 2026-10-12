import type {
  IntentConfig,
  IntentParseRequest,
  IntentParseOptions,
  IntentResult,
  ModelReply,
} from "./contracts/public.js";
import { prepareConfig, registerRuntime } from "./core/config.js";
import type { Runtime } from "./core/config.js";
import { prepareTask } from "./core/input.js";
import {
  acceptCandidate,
  attachPartial,
  nextRequest,
  startPipeline,
  stopPipeline,
} from "./core/pipeline.js";
import { IntentParseError, asIntentError, fail } from "./errors.js";
import { readSignalOptions } from "./internal/signal.js";
export class Intent {
  private readonly runtime: Runtime;
  constructor(config: IntentConfig = {}) {
    this.runtime = prepareConfig(config);
    registerRuntime(this, this.runtime);
  }
  async parse(request: IntentParseRequest, options?: IntentParseOptions): Promise<IntentResult> {
    if (arguments.length < 1 || arguments.length > 2)
      fail(
        "INPUT_INVALID",
        "input",
        "parse accepts a request and optional native call options.",
      );
    const task = prepareTask(this.runtime, request);
    const signal = readSignalOptions(options, "input");
    const executor = this.runtime.executor;
    if (!executor)
      fail(
        "EXECUTOR_NOT_CONFIGURED",
        "input",
        "Configure a ModelExecutor for parse; host collaboration uses bridge.",
      );
    if (signal?.aborted) fail("MODEL_ABORTED", "core", "Parse request cancelled.");
    if (this.runtime.parses >= this.runtime.limits.maxConcurrentParses)
      fail("LIMIT_EXCEEDED", "input", "Instance concurrency limit exceeded.");
    this.runtime.parses++;
    const state = startPipeline(this.runtime, task);
    let rejectAbort: (reason: unknown) => void = () => {};
    const aborted = new Promise<never>((_, reject) => {
      rejectAbort = reject;
    });
    // A synchronous cancellation can precede the first Promise.race.
    void aborted.catch(() => {});
    const onAbort = () => rejectAbort(state.controller.signal.reason);
    state.controller.signal.addEventListener("abort", onAbort, { once: true });
    const cancel = () => state.controller.abort(new IntentParseError(
      "MODEL_ABORTED", state.stage, "Parse request cancelled.",
    ));
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
    const deadline = this.runtime.timeoutMs ? performance.now() + this.runtime.timeoutMs : undefined;
    const timeout = () => state.controller.abort(
      new IntentParseError(
        "MODEL_TIMEOUT",
        state.stage,
        "Total parse deadline exceeded.",
      ),
    );
    const timer = this.runtime.timeoutMs ? setTimeout(timeout, this.runtime.timeoutMs) : undefined;
    const checkDeadline = () => {
      if (deadline !== undefined && performance.now() >= deadline && !state.controller.signal.aborted) timeout();
      state.controller.signal.throwIfAborted();
    };
    try {
      while (!state.terminal) {
        checkDeadline();
        const modelRequest = nextRequest(state);
        const reply: ModelReply = await Promise.race([
          Promise.resolve().then(() => {
            checkDeadline();
            return executor.generate(modelRequest);
          }),
          aborted,
        ]);
        checkDeadline();
        const result = await Promise.race([acceptCandidate(state, reply), aborted]);
        checkDeadline();
        if (result) return result;
      }
      return fail(
        "MODEL_OUTPUT_INVALID",
        state.stage,
        "Pipeline ended without a result.",
      );
    } catch (cause) {
      const error = this.runtime.disposed
        ? new IntentParseError(
            "INSTANCE_DISPOSED",
            state.stage,
            "Intent instance is disposed.",
          )
        : asIntentError(cause, state.stage);
      throw attachPartial(state, error);
    } finally {
      this.runtime.parses--;
      clearTimeout(timer);
      state.controller.signal.removeEventListener("abort", onAbort);
      signal?.removeEventListener("abort", cancel);
      stopPipeline(state);
      state.controller.abort();
    }
  }
  dispose(): void {
    if (this.runtime.disposed) return;
    this.runtime.disposed = true;
    for (const controller of this.runtime.active)
      controller.abort(
        new IntentParseError(
          "INSTANCE_DISPOSED",
          "core",
          "Intent instance is disposed.",
        ),
      );
    this.runtime.active.clear();
    this.runtime.store.dispose();
  }
}
