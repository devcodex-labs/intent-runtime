import { Worker } from 'node:worker_threads';
import { IntentError } from '../contracts/errors.js';
import type { IntentErrorCode, IntentErrorStage } from '../contracts/public.js';
export interface ValidationTask {
  draft: import('../model/candidate.js').CandidateDraft;
  materials: Record<string, unknown>;
  schema?: import('../contracts/public.js').JsonObject;
  extension?: import('../contracts/public.js').JsonObject;
  selection: string[]; extensions: boolean; maxBytes: number; maxSchemaBytes: number; maxDepth: number; maxChecks: number; used: number;
}
export interface ValidationReply {
  values: import('../model/candidate.js').CheckedField[];
  issues: Array<{ownerKey: string | null; issue: import('../contracts/public.js').IntentIssue}>;
  used: number;
}
interface Entry {data: ValidationTask; signal: AbortSignal; resolve: (r: ValidationReply) => void; reject: (e: IntentError) => void; abort: () => void}
// One owned worker per Intent. Queue length is already bounded by recognition leases.
export class ValidationRunner {
  private worker: Worker | undefined;
  private running: Entry | undefined;
  private readonly queue: Entry[] = [];
  private closing = false;
  private terminating = false;
  run(data: ValidationTask, signal: AbortSignal): Promise<ValidationReply> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {reject(signal.reason); return;}
      if (this.closing) {reject(new IntentError('INSTANCE_DISPOSED')); return;}
      const entry: Entry = {data, signal, resolve, reject, abort: () => {}};
      entry.abort = () => {
        if (this.running === entry) this.stop(signal.reason as IntentError);
        else {const index = this.queue.indexOf(entry); if (index >= 0) this.queue.splice(index, 1); signal.removeEventListener('abort', entry.abort); reject(signal.reason);}
      };
      signal.addEventListener('abort', entry.abort, {once: true}); this.queue.push(entry); this.pump();
    });
  }
  private pump(): void {
    if (this.running || this.terminating || this.closing) return;
    const next = this.queue.shift(); if (!next) {this.worker?.unref(); return;}
    this.running = next;
    if (!this.worker) {
      try {
        const worker = new Worker(new URL('./schema/worker.mjs', import.meta.url), {env: {}, stdout: true, stderr: true});
        // Dependency diagnostics may include schema keys. Never forward them to app logs/stdout.
        worker.stdout?.resume(); worker.stderr?.resume(); this.worker = worker;
        worker.on('message', (message: {reply?: ValidationReply; error?: {code: IntentErrorCode; stage: IntentErrorStage; details?: import('../contracts/public.js').IntentErrorDetails}}) => {
          if (worker !== this.worker || this.terminating || !this.running) return;
          const entry = this.running; this.running = undefined; entry.signal.removeEventListener('abort', entry.abort);
          if (message.reply) entry.resolve(message.reply);
          else if (message.error) entry.reject(new IntentError(message.error.code, {stage: message.error.stage, ...(message.error.details ? {details: message.error.details} : {})}));
          else entry.reject(new IntentError('INTERNAL_PROCESSING_FAILED', {stage: 'validation'}));
          this.pump();
        });
        worker.on('error', () => {if (worker === this.worker && !this.terminating) this.stop(new IntentError('INTERNAL_PROCESSING_FAILED', {stage: 'validation'}));});
        worker.on('exit', () => {if (worker === this.worker && !this.terminating) this.stop(new IntentError('INTERNAL_PROCESSING_FAILED', {stage: 'validation'}));});
      } catch {this.stop(new IntentError('INTERNAL_PROCESSING_FAILED', {stage: 'validation'})); return;}
    }
    this.worker.ref();
    try {this.worker.postMessage(next.data);} catch {this.stop(new IntentError('INTERNAL_PROCESSING_FAILED', {stage: 'validation'}));}
  }
  private stop(error: IntentError): void {
    if (this.terminating) return;
    const entry = this.running, worker = this.worker; this.running = undefined; this.worker = undefined; this.terminating = true;
    entry?.signal.removeEventListener('abort', entry.abort);
    // Reject physical work only AFTER the old worker has exited; then pump the next generation.
    Promise.resolve(worker?.terminate()).catch(() => {}).then(() => {entry?.reject(error); this.terminating = false; this.pump();});
  }
  close(): void {
    if (this.closing) return; this.closing = true;
    for (const entry of this.queue.splice(0)) {entry.signal.removeEventListener('abort', entry.abort); entry.reject(new IntentError('INSTANCE_DISPOSED'));}
    this.stop(new IntentError('INSTANCE_DISPOSED'));
  }
}
