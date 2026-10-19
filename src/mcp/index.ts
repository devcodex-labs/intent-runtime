import { randomUUID } from 'node:crypto';
import type { Intent } from '../intent.js';
import type { IntentParseRequest, IntentParseOptions, IntentConfig, JsonObject, IntentResult } from '../contracts/public.js';
import { IntentError } from '../contracts/errors.js';
import { intentAccess, type RecognitionLease } from '../core/access.js';
import { INTENT_RESULT_SCHEMA, BASELINE_SCHEMA } from '../contracts/generated.js';
import { cloneJson, plain } from '../internal/json.js';
import { MCP_TOOL_NAMES, MCP_TOOL_NAMES_BY_MODE } from './tool-names.js';

export type IntentMcpProtocolVersion = '2025-06-18' | '2025-11-25' | '2026-07-28';
export type IntentMcpMode = 'executor' | 'host';
export type IntentMcpAdapterConfig = {mode?: IntentMcpMode; instances: Readonly<Record<string, Intent>>; toolPrefix?: string};
export type IntentMcpConnectOptions = {protocolVersion: IntentMcpProtocolVersion};
export type IntentMcpToolDefinition = {name: string; description: string; inputSchema: JsonObject; outputSchema: JsonObject};
export type IntentMcpToolResult = {resultType?: 'complete'; content: Array<{type: 'text'; text: string}>; structuredContent?: JsonObject; isError: boolean};
export interface IntentMcpSession {callTool(name: string, args: unknown, options?: IntentParseOptions): Promise<IntentMcpToolResult | undefined>; close(): Promise<void>}
export interface IntentMcpAdapter {readonly tools: readonly IntentMcpToolDefinition[]; connect(options: IntentMcpConnectOptions): IntentMcpSession; close(): Promise<void>}
export type IntentMcpParseRequest = IntentParseRequest & {instance?: string};
export type HostPrepareRequest = IntentMcpParseRequest;
export type HostTask = {kind: 'model_task'; requestId: string; submissionToken: string; instructions: string; input: JsonObject; outputSchema: JsonObject};
export type HostAcceptRequest = {requestId: string; submissionToken: string; candidateText: string};
export type HostCancelRequest = {requestId: string; reason?: 'cancelled' | 'refusal' | 'incomplete'};
export type HostCancelReply = {requestId: string; status: 'cancelled' | 'already_cancelled' | 'already_completed'};
export type IntentMcpServerConfig = {mode?: IntentMcpMode; instances: Record<string, IntentConfig>; toolPrefix?: string};

type HostRecord = {id: string; token: string; state: 'waiting' | 'validating' | 'completed' | 'cancelled'; session: Session;
  lease?: RecognitionLease; text?: string; result?: IntentResult; error?: IntentError; pending?: Promise<IntentResult>; bytes?: number};
const versions = ['2025-06-18', '2025-11-25', '2026-07-28'];
const requestKeys = ['instance', 'input', 'fields', 'context', 'baseline', 'referenceTime', 'output'];
function data(input: unknown, keys: string[], code: 'INPUT_INVALID' | 'CONFIG_INVALID', stage: 'input' | 'transport' = 'input'): Record<string, unknown> {
  const bad = (): never => {throw new IntentError(code, {stage: code === 'CONFIG_INVALID' ? 'transport' : stage});};
  if (!plain(input)) return bad();
  const result: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(input)) {
    const d = Object.getOwnPropertyDescriptor(input, key);
    if (typeof key !== 'string' || !keys.includes(key) || !d || !('value' in d) || !d.enumerable) return bad();
    if (d.value !== undefined) result[key] = d.value;
  }
  return result;
}
function nameValid(name: string): boolean {return /^[A-Za-z0-9_.-]{1,64}$/.test(name) && !['__proto__', 'prototype', 'constructor'].includes(name);}
function freeze<T>(value: T): T {if (value && typeof value === 'object') {Object.values(value).forEach(freeze); Object.freeze(value);} return value;}
const objectSchema = (properties: JsonObject, required: string[]): JsonObject => ({$schema: 'http://json-schema.org/draft-07/schema#', type: 'object', properties, required, additionalProperties: false});

class Adapter implements IntentMcpAdapter {
  readonly tools: readonly IntentMcpToolDefinition[];
  readonly instances = new Map<string, Intent>();
  readonly sessions = new Set<Session>();
  readonly terminal = new Map<string, HostRecord>();
  readonly mode: IntentMcpMode;
  readonly prefix: string;
  private bytes = 0;
  private closed = false;
  constructor(config: IntentMcpAdapterConfig) {
    const c = data(config, ['mode', 'instances', 'toolPrefix'], 'CONFIG_INVALID');
    this.mode = c.mode === undefined ? 'executor' : c.mode as IntentMcpMode;
    this.prefix = c.toolPrefix === undefined ? '' : c.toolPrefix as string;
    if (!['executor', 'host'].includes(this.mode) || typeof this.prefix !== 'string' || this.prefix && !/^[A-Za-z0-9_.-]+$/.test(this.prefix) || MCP_TOOL_NAMES_BY_MODE[this.mode].some(name => this.prefix.length + name.length > 128) || !plain(c.instances)) throw new IntentError('CONFIG_INVALID', {stage: 'transport'});
    for (const key of Reflect.ownKeys(c.instances)) {
      const d = Object.getOwnPropertyDescriptor(c.instances, key);
      if (typeof key !== 'string' || !nameValid(key) || !d || !('value' in d) || !d.enumerable || !intentAccess.has(d.value)) throw new IntentError('CONFIG_INVALID', {stage: 'transport'});
      intentAccess.get(d.value)!.assertAvailable(this.mode === 'executor'); this.instances.set(key, d.value);
    }
    if (!this.instances.size) throw new IntentError('CONFIG_INVALID', {stage: 'transport'});
    const parseSchema = objectSchema({instance: {type: 'string', enum: [...this.instances.keys()]}, input: {type: 'string'}, fields: {anyOf: [{const: 'all'}, {type: 'array', items: {type: 'string'}}]}, context: {type: 'object', additionalProperties: true}, baseline: cloneJson(BASELINE_SCHEMA) as unknown as JsonObject, referenceTime: {type: 'string'}, output: objectSchema(Object.fromEntries(['suggestions', 'evidence', 'diagnostics', 'extensions'].map(k => [k, {type: 'boolean'}])), [])}, ['input']);
    parseSchema.definitions = cloneJson(BASELINE_SCHEMA.definitions) as unknown as JsonObject;
    const taskSchema = objectSchema({kind: {const: 'model_task'}, requestId: {type: 'string'}, submissionToken: {type: 'string'}, instructions: {type: 'string'}, input: {type: 'object', additionalProperties: true}, outputSchema: {type: 'object', additionalProperties: true}}, ['kind', 'requestId', 'submissionToken', 'instructions', 'input', 'outputSchema']);
    const description = 'Structure only caller-supplied intent; never execute business operations. ';
    this.tools = freeze(this.mode === 'executor' ? [{name: this.prefix + MCP_TOOL_NAMES.parse, description: description + 'Generate and validate one result with the configured executor.', inputSchema: parseSchema, outputSchema: cloneJson(INTENT_RESULT_SCHEMA) as unknown as JsonObject}] : [
      {name: this.prefix + MCP_TOOL_NAMES.prepare, description: description + 'Prepare a candidate task for the CURRENT host model; no independent model is called.', inputSchema: parseSchema, outputSchema: taskSchema},
      {name: this.prefix + MCP_TOOL_NAMES.accept, description: description + 'Validate the current host candidate using the same recognition core.', inputSchema: objectSchema({requestId: {type: 'string'}, submissionToken: {type: 'string'}, candidateText: {type: 'string'}}, ['requestId', 'submissionToken', 'candidateText']), outputSchema: cloneJson(INTENT_RESULT_SCHEMA) as unknown as JsonObject},
      {name: this.prefix + MCP_TOOL_NAMES.cancel, description: description + 'End only this short recognition handoff.', inputSchema: objectSchema({requestId: {type: 'string'}, reason: {enum: ['cancelled', 'refusal', 'incomplete']}}, ['requestId']), outputSchema: objectSchema({requestId: {type: 'string'}, status: {enum: ['cancelled', 'already_cancelled', 'already_completed']}}, ['requestId', 'status'])},
    ]);
  }
  connect(options: IntentMcpConnectOptions): IntentMcpSession {
    const o = data(options, ['protocolVersion'], 'CONFIG_INVALID');
    if (!versions.includes(o.protocolVersion as string)) throw new IntentError('CONFIG_INVALID', {stage: 'transport'});
    if (this.closed) throw new IntentError('INSTANCE_DISPOSED', {stage: 'transport'});
    const session = new Session(this, o.protocolVersion as IntentMcpProtocolVersion); this.sessions.add(session); return session;
  }
  retain(record: HostRecord): void {
    record.lease?.close(); delete record.lease; delete record.pending;
    if (record.session.closed) {this.remove(record); return;}
    record.bytes = Buffer.byteLength(JSON.stringify({id: record.id, token: record.token, text: record.text, result: record.result, error: record.error?.toJSON(), state: record.state}));
    if (record.bytes > 8388608) {this.remove(record); return;}
    this.terminal.set(record.id, record); this.bytes += record.bytes;
    while (this.terminal.size > 32 || this.bytes > 8388608) this.remove(this.terminal.values().next().value!);
  }
  remove(record: HostRecord): void {
    if (this.terminal.delete(record.id)) this.bytes -= record.bytes ?? 0;
    record.session.records.delete(record.id);
  }
  async close(): Promise<void> {if (this.closed) return; this.closed = true; await Promise.all([...this.sessions].map(s => s.close()));}
}

class Session implements IntentMcpSession {
  readonly records = new Map<string, HostRecord>();
  readonly controllers = new Set<AbortController>();
  closed = false;
  constructor(private readonly adapter: Adapter, private readonly version: IntentMcpProtocolVersion) {}
  private envelope(value: IntentResult | HostTask | HostCancelReply): IntentMcpToolResult {
    return {...(this.version === '2026-07-28' ? {resultType: 'complete' as const} : {}), content: [{type: 'text', text: JSON.stringify(value)}], structuredContent: cloneJson(value) as unknown as JsonObject, isError: false};
  }
  private error(error: IntentError): IntentMcpToolResult {return {...(this.version === '2026-07-28' ? {resultType: 'complete' as const} : {}), content: [{type: 'text', text: JSON.stringify({error: error.toJSON()})}], isError: true};}
  async callTool(name: string, args: unknown, options: IntentParseOptions = {}): Promise<IntentMcpToolResult | undefined> {
    if (!this.adapter.tools.some(t => t.name === name)) return undefined;
    try {
      if (this.closed) throw new IntentError(name === this.adapter.prefix + MCP_TOOL_NAMES.accept || name === this.adapter.prefix + MCP_TOOL_NAMES.cancel ? 'HOST_REQUEST_NOT_FOUND' : 'INSTANCE_DISPOSED', {stage: 'transport'});
      const o = data(options, ['signal'], 'INPUT_INVALID');
      if (o.signal !== undefined && !(o.signal instanceof AbortSignal)) throw new IntentError('INPUT_INVALID');
      const signal = o.signal as AbortSignal | undefined;
      if (name === this.adapter.prefix + MCP_TOOL_NAMES.accept) return this.envelope(await this.accept(args, signal));
      if (name === this.adapter.prefix + MCP_TOOL_NAMES.cancel) return this.envelope(this.cancel(args));
      const request = data(args, requestKeys, 'INPUT_INVALID'), instanceName = request.instance;
      if (instanceName !== undefined && typeof instanceName !== 'string') throw new IntentError('INPUT_INVALID');
      const instance = instanceName === undefined && this.adapter.instances.size === 1 ? this.adapter.instances.values().next().value : this.adapter.instances.get(instanceName as string);
      if (!instance) throw new IntentError('INPUT_INVALID'); delete request.instance;
      if (name === this.adapter.prefix + MCP_TOOL_NAMES.prepare) {
        const lease = intentAccess.get(instance)!.prepare(request as unknown as IntentParseRequest, signal ? {signal} : {});
        const record: HostRecord = {id: randomUUID(), token: randomUUID(), state: 'waiting', session: this, lease};
        const task: HostTask = {kind: 'model_task', requestId: record.id, submissionToken: record.token, instructions: lease.request.instructions, input: lease.request.input, outputSchema: lease.request.outputSchema as JsonObject};
        let response: IntentMcpToolResult;
        try {lease.measureTask(task); response = this.envelope(task); lease.assertActive();} catch (error) {lease.close(); throw error;}
        this.records.set(record.id, record);
        lease.terminated.then(error => {if (record.state === 'waiting' || record.state === 'validating') this.end(record, error);});
        return response;
      }
      const controller = new AbortController(), abort = () => controller.abort();
      if (signal?.aborted) controller.abort(); else signal?.addEventListener('abort', abort, {once: true});
      this.controllers.add(controller);
      try {return this.envelope(await instance.parse(request as unknown as IntentParseRequest, {signal: controller.signal}));}
      finally {signal?.removeEventListener('abort', abort); this.controllers.delete(controller);}
    } catch (cause) {return this.error(cause instanceof IntentError ? cause : new IntentError('INTERNAL_PROCESSING_FAILED', {stage: 'transport'}));}
  }
  private end(record: HostRecord, error: IntentError): void {
    if (record.state === 'completed' || record.state === 'cancelled') return;
    record.state = 'cancelled'; record.error = error; delete record.text;
    record.lease?.abort(error); this.adapter.retain(record);
  }
  private async accept(args: unknown, signal?: AbortSignal): Promise<IntentResult> {
    const a = data(args, ['requestId', 'submissionToken', 'candidateText'], 'INPUT_INVALID');
    if (typeof a.requestId !== 'string' || typeof a.submissionToken !== 'string' || typeof a.candidateText !== 'string') throw new IntentError('INPUT_INVALID');
    const record = this.records.get(a.requestId);
    if (!record) throw new IntentError('HOST_REQUEST_NOT_FOUND');
    if (record.token !== a.submissionToken) throw new IntentError('HOST_SUBMISSION_CONFLICT');
    if (record.state === 'completed' || record.state === 'validating') {
      if (record.text !== a.candidateText) throw new IntentError('HOST_SUBMISSION_CONFLICT');
      if (record.state === 'completed') return record.result!;
    }
    if (record.state === 'cancelled') throw record.error!;
    const lease = record.lease!, abort = () => lease.abort(new IntentError('REQUEST_ABORTED'));
    if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, {once: true});
    try {
      if (record.pending) return await record.pending;
      record.state = 'validating'; record.text = a.candidateText;
      record.pending = (async () => {
        try {
          const result = await lease.accept(a.candidateText as string);
          if (record.error) throw record.error;
          record.state = 'completed'; record.result = result; this.adapter.retain(record); return result;
        } catch (cause) {
          const error = cause instanceof IntentError ? cause : new IntentError('INTERNAL_PROCESSING_FAILED', {stage: 'output'});
          if (record.state === 'cancelled') throw record.error!;
          const retryable = error.code === 'MODEL_OUTPUT_INVALID' || error.code === 'RESOURCE_LIMIT' && error.stage === 'validation' && ['maxOutputBytes', 'maxDepth'].includes(error.details?.limit ?? '');
          if (retryable) {record.state = 'waiting'; delete record.pending; delete record.text;} else this.end(record, error);
          throw error;
        }
      })();
      return await record.pending;
    } finally {signal?.removeEventListener('abort', abort);}
  }
  private cancel(args: unknown): HostCancelReply {
    const a = data(args, ['requestId', 'reason'], 'INPUT_INVALID');
    if (typeof a.requestId !== 'string' || a.reason !== undefined && !['cancelled', 'refusal', 'incomplete'].includes(a.reason as string)) throw new IntentError('INPUT_INVALID');
    const record = this.records.get(a.requestId); if (!record) throw new IntentError('HOST_REQUEST_NOT_FOUND');
    if (record.state === 'completed') return {requestId: record.id, status: 'already_completed'};
    if (record.state === 'cancelled') return {requestId: record.id, status: 'already_cancelled'};
    this.end(record, new IntentError(a.reason === 'refusal' ? 'MODEL_REFUSED' : a.reason === 'incomplete' ? 'MODEL_OUTPUT_INCOMPLETE' : 'REQUEST_ABORTED'));
    return {requestId: record.id, status: 'cancelled'};
  }
  async close(): Promise<void> {
    if (this.closed) return; this.closed = true;
    for (const c of this.controllers) c.abort();
    for (const record of this.records.values()) {this.end(record, new IntentError('REQUEST_ABORTED')); this.adapter.remove(record);}
    this.adapter.sessions.delete(this);
  }
}
export function createIntentMcpAdapter(config: IntentMcpAdapterConfig): IntentMcpAdapter {return new Adapter(config);}
