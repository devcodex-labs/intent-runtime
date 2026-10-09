import { Worker } from "node:worker_threads";
import { randomUUID } from "node:crypto";
import type { JSONSchema } from "../contracts/public.js";
import { IntentParseError } from "../errors.js";

export interface NativeValidation { valid: boolean; descriptionPaths: string[] }
interface Task {
  id: string; schema: JSONSchema; original: JSONSchema; data: unknown; signal: AbortSignal | undefined;
  resolve: (value: NativeValidation) => void; reject: (error: unknown) => void;
  abort: () => void; timer: ReturnType<typeof setTimeout> | undefined; done: boolean;
}
interface Slot {
  worker: Worker; task: Task | undefined; retiring: boolean;
  idle: ReturnType<typeof setTimeout> | undefined;
}
// Each instance owns at most two live threads (including threads terminating).
// The queue, computation time, heap and idle lifetime are independently bounded.
export class SchemaWorkerPool {
  private readonly slots = new Set<Slot>();
  private readonly tasks = new Set<Task>();
  private readonly queue: Task[] = [];
  private disposed = false;
  constructor(private readonly cacheSize: number, private readonly budgetMs: number, private readonly queueSize: number) {}
  validate(schema: JSONSchema, original: JSONSchema, data: unknown, signal?: AbortSignal): Promise<NativeValidation> {
    if (this.disposed) return Promise.reject(new IntentParseError("INSTANCE_DISPOSED", "data", "Validation instance disposed."));
    if (signal?.aborted) return Promise.reject(signal.reason);
    if (this.tasks.size >= this.queueSize) return Promise.reject(new IntentParseError("LIMIT_EXCEEDED", "data", "Native validation queue is full."));
    return new Promise((resolve, reject) => {
      const task: Task = { id: randomUUID(), schema, original, data: structuredClone(data), signal,
        resolve, reject, abort: () => {}, timer: undefined, done: false };
      task.abort = () => this.finish(task, signal?.reason, undefined, true);
      task.timer = setTimeout(() => this.finish(task,
        new IntentParseError("LIMIT_EXCEEDED", "data", "Native validation exceeded maxValidationMs, including queue and worker startup."), undefined, true), this.budgetMs);
      signal?.addEventListener("abort", task.abort, { once: true });
      this.tasks.add(task); this.queue.push(task); this.pump();
    });
  }
  private finish(task: Task, error?: unknown, value?: NativeValidation, terminate = false): void {
    if (task.done) return;
    task.done = true;
    clearTimeout(task.timer);
    task.signal?.removeEventListener("abort", task.abort);
    this.tasks.delete(task);
    const index = this.queue.indexOf(task);
    if (index !== -1) this.queue.splice(index, 1);
    const slot = [...this.slots].find(slot => slot.task === task);
    if (slot) {
      slot.task = undefined;
      if (terminate) this.retire(slot);
      else {
        slot.worker.unref();
        slot.idle = setTimeout(() => this.retire(slot), 1000);
        slot.idle.unref();
      }
    }
    if (value) task.resolve(value); else task.reject(error);
    this.pump();
  }
  private retire(slot: Slot): void {
    if (slot.retiring) return;
    slot.retiring = true;
    clearTimeout(slot.idle);
    // Keep the slot until exit: cancellation storms must not spawn unbounded
    // replacement threads while old threads are still alive.
    void slot.worker.terminate().catch(() => { this.slots.delete(slot); this.pump(); });
  }
  private createSlot(): Slot {
    const worker = new Worker(new URL("./validation-worker.mjs", import.meta.url), {
      execArgv: [], workerData: { cacheSize: this.cacheSize },
      resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 },
    });
    const slot: Slot = { worker, task: undefined, retiring: false, idle: undefined };
    this.slots.add(slot);
    worker.on("message", (message: { id?: string; valid?: boolean; descriptionPaths?: string[] }) => {
      const task = slot.task;
      if (!task || message.id !== task.id) return;
      if (typeof message.valid === "boolean" && Array.isArray(message.descriptionPaths) && message.descriptionPaths.every(path => typeof path === "string")) this.finish(task, undefined, { valid: message.valid, descriptionPaths: message.descriptionPaths });
      else this.finish(task, new IntentParseError("MODEL_REQUEST_FAILED", "data", "Native Schema validation failed."), undefined, true);
    });
    worker.once("error", () => {
      if (slot.task) this.finish(slot.task, new IntentParseError("MODEL_REQUEST_FAILED", "data", "Validation worker failed."), undefined, true);
      else this.retire(slot);
    });
    worker.once("exit", () => {
      this.slots.delete(slot);
      if (slot.task) this.finish(slot.task, new IntentParseError("MODEL_REQUEST_FAILED", "data", "Validation worker exited."));
      this.pump();
    });
    return slot;
  }
  private pump(): void {
    if (this.disposed) return;
    while (this.queue.length) {
      let slot = [...this.slots].find(slot => !slot.retiring && !slot.task);
      if (!slot && this.slots.size < 2) {
        try { slot = this.createSlot(); }
        catch {
          this.finish(this.queue[0]!, new IntentParseError("MODEL_REQUEST_FAILED", "data", "Cannot start validation worker."));
          continue;
        }
      }
      if (!slot) return;
      const task = this.queue.shift()!;
      clearTimeout(slot.idle); slot.idle = undefined; slot.task = task;
      slot.worker.ref();
      try { slot.worker.postMessage({ id: task.id, schema: task.schema, original: task.original, data: task.data }); }
      catch { this.finish(task, new IntentParseError("MODEL_REQUEST_FAILED", "data", "Cannot dispatch native validation."), undefined, true); }
    }
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const task of [...this.tasks]) this.finish(task, new IntentParseError("INSTANCE_DISPOSED", "data", "Validation instance disposed."), undefined, true);
    for (const slot of this.slots) this.retire(slot);
  }
}
