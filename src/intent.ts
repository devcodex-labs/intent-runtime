import type {
  IntentConfig,
  IntentParseRequest,
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
export class Intent {
  private readonly runtime: Runtime;
  constructor(config: IntentConfig = {}) {
    this.runtime = prepareConfig(config);
    registerRuntime(this, this.runtime);
  }
  async parse(request: IntentParseRequest): Promise<IntentResult> {
    if (arguments.length !== 1)
      fail(
        "INPUT_INVALID",
        "input",
        "parse accepts exactly one request object.",
      );
    const task = prepareTask(this.runtime, request);
    const executor = this.runtime.executor;
    if (!executor)
      fail(
        "EXECUTOR_NOT_CONFIGURED",
        "input",
        "Configure a ModelExecutor for parse; host collaboration uses bridge.",
      );
    if (this.runtime.parses >= this.runtime.limits.maxConcurrentParses)
      fail("LIMIT_EXCEEDED", "input", "Instance concurrency limit exceeded.");
    this.runtime.parses++;
    const state = startPipeline(this.runtime, task);
    let rejectAbort: (reason: unknown) => void = () => {};
    const aborted = new Promise<never>((_, reject) => {
      rejectAbort = reject;
    });
    const onAbort = () => rejectAbort(state.controller.signal.reason);
    state.controller.signal.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(
      () =>
        state.controller.abort(
          new IntentParseError(
            "MODEL_TIMEOUT",
            state.stage,
            "Total parse deadline exceeded.",
          ),
        ),
      this.runtime.timeoutMs,
    );
    try {
      while (!state.terminal) {
        const modelRequest = nextRequest(state);
        const reply: ModelReply = await Promise.race([
          Promise.resolve().then(() => executor.generate(modelRequest)),
          aborted,
        ]);
        const result = acceptCandidate(state, reply);
        if (result) return result;
      }
      fail(
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
