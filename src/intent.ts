import { performance } from 'node:perf_hooks';
import { parse as parseLanguage } from 'bcp-47';
import type { IntentConfig, IntentLimits, IntentOutputOptions, IntentParseRequest, IntentParseOptions, IntentResult, ModelExecutor, ModelReply, JsonObject } from './contracts/public.js';
import { IntentError, fail, violation } from './contracts/errors.js';
import { BASELINE_SCHEMA, CANDIDATE_SCHEMA, INTENT_RESULT_SCHEMA } from './contracts/generated.js';
import { cloneJson, decodeJson, measure, plain, snapshot } from './internal/json.js';
import { schemaSnapshot } from './schema/snapshot.js';
import { Definition } from './schema/compile.js';
import { ValidationBudget } from './schema/validate.js';
import { ValidationRunner } from './schema/runner.js';
import { ContractValidator } from './core/contracts.js';
import { assemble } from './core/assemble.js';
import { invariants } from './core/invariants.js';
import type { CandidateDraft } from './model/candidate.js';
import { INSTRUCTIONS } from './model/instructions.js';

export const DEFAULT_LIMITS: Readonly<IntentLimits> = Object.freeze({maxInputBytes: 65536, maxContextBytes: 1048576, maxBaselineBytes: 1048576, maxSchemaBytes: 262144, maxRequestBytes: 3145728, maxOutputBytes: 1048576, maxDepth: 64, maxConcurrentParses: 8, maxValidationChecks: 256});
const OUTPUT = Object.freeze({suggestions: false, evidence: false, diagnostics: false, extensions: false});
type Job = {controller: AbortController; logicalDone: boolean; physicalDone: boolean};
function dataKeys(input: unknown, allowed: string[], code: 'CONFIG_INVALID' | 'INPUT_INVALID'): Record<string, unknown> {
  if (!plain(input)) return fail(code);
  const data: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(input)) {
    const d = Object.getOwnPropertyDescriptor(input, key);
    if (typeof key !== 'string' || !allowed.includes(key) || !d || !('value' in d) || !d.enumerable) return fail(code);
    if (d.value !== undefined) data[key] = d.value;
  }
  return data;
}
function outputFlags(value: unknown, defaults: Required<IntentOutputOptions> = OUTPUT): Required<IntentOutputOptions> {
  if (value === undefined) return {...defaults};
  const values = dataKeys(value, Object.keys(OUTPUT), 'INPUT_INVALID');
  if (Object.values(values).some(v => typeof v !== 'boolean')) fail('INPUT_INVALID');
  return {...defaults, ...values};
}
export class Intent {
  private disposed = false;
  private readonly limits: IntentLimits;
  private readonly timeoutMs: number;
  private readonly output: Required<IntentOutputOptions>;
  private readonly executor?: ModelExecutor;
  private readonly schema?: Definition;
  private readonly extension?: Definition;
  private readonly staticMaterials: JsonObject;
  private readonly runner = new ValidationRunner();
  private readonly contracts = new ContractValidator();
  private readonly jobs = new Set<Job>();
  constructor(config: IntentConfig) {
    const data = dataKeys(config, ['language', 'executor', 'schema', 'extensionSchema', 'semantics', 'timeoutMs', 'limits', 'defaultOutput'], 'CONFIG_INVALID');
    const limits = data.limits === undefined ? {} : dataKeys(data.limits, Object.keys(DEFAULT_LIMITS), 'CONFIG_INVALID');
    this.limits = {...DEFAULT_LIMITS, ...limits};
    if (Object.values(this.limits).some(v => !Number.isSafeInteger(v) || v <= 0)) fail('CONFIG_INVALID');
    this.timeoutMs = (data.timeoutMs ?? 0) as number;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 0 || this.timeoutMs > 2147483647) fail('CONFIG_INVALID');
    const language = data.language ?? 'en'; let badLanguage = false;
    if (typeof language !== 'string' || !language || language.length > 255 || language.trim() !== language) fail('CONFIG_INVALID');
    parseLanguage(language, {warning: () => {badLanguage = true;}}); if (badLanguage) fail('CONFIG_INVALID');
    try { this.output = outputFlags(data.defaultOutput); } catch (cause) {throw new IntentError('CONFIG_INVALID', {stage: 'config', cause});}
    if (data.executor !== undefined) {
      const executor = data.executor as ModelExecutor;
      if (!executor || typeof executor.id !== 'string' || !executor.id.trim() || typeof executor.generate !== 'function') fail('CONFIG_INVALID');
      this.executor = {id: executor.id, generate: executor.generate.bind(executor)};
    }
    const rawSchema = data.schema === undefined ? undefined : schemaSnapshot(config.schema!, this.limits.maxSchemaBytes, this.limits.maxDepth);
    const rawExtension = data.extensionSchema === undefined ? undefined : schemaSnapshot(config.extensionSchema!, this.limits.maxSchemaBytes, this.limits.maxDepth);
    this.staticMaterials = {language, ...(rawSchema ? {schema: rawSchema} : {}), ...(rawExtension ? {extensionSchema: rawExtension} : {})};
    if (data.semantics !== undefined) this.staticMaterials.semantics = snapshot(data.semantics as JsonObject, {maxBytes: this.limits.maxRequestBytes, maxDepth: this.limits.maxDepth, limit: 'maxRequestBytes', stage: 'config', invalid: 'CONFIG_INVALID'});
    measure(this.staticMaterials, {maxBytes: this.limits.maxRequestBytes, maxDepth: this.limits.maxDepth, limit: 'maxRequestBytes', stage: 'config', invalid: 'CONFIG_INVALID'});
    if (rawSchema) this.schema = new Definition(rawSchema, this.limits.maxSchemaBytes, this.limits.maxDepth);
    if (rawExtension) this.extension = new Definition(rawExtension, this.limits.maxSchemaBytes, this.limits.maxDepth);
    if (this.extension?.fields.some(f => this.schema?.fields.includes(f))) fail('CONFIG_INVALID');
  }
  async parse(request: IntentParseRequest, options: IntentParseOptions = {}): Promise<IntentResult> {
    if (this.disposed) fail('INSTANCE_DISPOSED');
    const opt = dataKeys(options, ['signal'], 'INPUT_INVALID');
    if (opt.signal !== undefined && !(opt.signal instanceof AbortSignal)) fail('INPUT_INVALID');
    const signal = opt.signal as AbortSignal | undefined;
    const raw = dataKeys(request, ['input', 'fields', 'context', 'baseline', 'referenceTime', 'output'], 'INPUT_INVALID');
    if (typeof raw.input !== 'string' || !raw.input.trim()) fail('INPUT_INVALID', 'input', '/input');
    const inputBytes = Buffer.byteLength(raw.input);
    if (inputBytes > this.limits.maxInputBytes) throw new IntentError('RESOURCE_LIMIT', {stage: 'input', details: {limit: 'maxInputBytes', allowed: this.limits.maxInputBytes, observed: inputBytes, unit: 'bytes', path: '/input'}});
    for (const [key, limit] of [['context', 'maxContextBytes'], ['baseline', 'maxBaselineBytes']] as const) if (raw[key] !== undefined) {
      if (!plain(raw[key])) fail('INPUT_INVALID', 'input', '/' + key);
      measure(raw[key], {maxBytes: this.limits[limit], maxDepth: this.limits.maxDepth, limit, stage: 'input'});
    }
    if (raw.baseline !== undefined && !this.contracts.valid(BASELINE_SCHEMA, raw.baseline)) fail('INPUT_INVALID', 'input', '/baseline');
    if (raw.referenceTime !== undefined && (typeof raw.referenceTime !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(raw.referenceTime) || !Number.isFinite(Date.parse(raw.referenceTime)))) fail('INPUT_INVALID', 'input', '/referenceTime');
    if (raw.fields !== undefined && raw.fields !== 'all') measure(raw.fields, {maxBytes: this.limits.maxRequestBytes, maxDepth: this.limits.maxDepth, limit: 'maxRequestBytes', stage: 'input'});
    if (raw.fields !== undefined && raw.fields !== 'all' && (!Array.isArray(raw.fields) || raw.fields.some(f => typeof f !== 'string'))) fail('INPUT_INVALID', 'input', '/fields');
    if ((raw.fields === 'all' || Array.isArray(raw.fields) && raw.fields.length) && !this.schema) fail('SCHEMA_NOT_CONFIGURED', 'input', '/schema');
    const selected = raw.fields === 'all' ? this.schema!.fields : [...new Set(raw.fields as string[] ?? [])];
    for (const field of selected) if (!this.schema!.fields.includes(field)) fail('FIELD_UNKNOWN', 'input', '/fields');
    const flags = outputFlags(raw.output, this.output);
    if (flags.extensions && !this.extension) fail('SCHEMA_NOT_CONFIGURED', 'input', '/extensionSchema');
    const combinedRequest: Record<string, unknown> = {...raw, fields: raw.fields ?? [], output: flags};
    const full = {...this.staticMaterials, request: combinedRequest};
    const input = snapshot(full, {maxBytes: this.limits.maxRequestBytes, maxDepth: this.limits.maxDepth, limit: 'maxRequestBytes', stage: 'input'});
    if (!this.executor) fail('EXECUTOR_NOT_CONFIGURED');
    if (signal?.aborted) fail('REQUEST_ABORTED');
    if (this.jobs.size >= this.limits.maxConcurrentParses) throw new IntentError('RESOURCE_LIMIT', {details: {limit: 'maxConcurrentParses', allowed: this.limits.maxConcurrentParses, observed: this.jobs.size + 1, unit: 'calls'}});
    const job: Job = {controller: new AbortController(), logicalDone: false, physicalDone: false}; this.jobs.add(job);
    const release = () => {if (job.logicalDone && job.physicalDone) this.jobs.delete(job);};
    let rejectAbort!: (e: IntentError) => void;
    const stopped = new Promise<never>((_, reject) => {rejectAbort = reject;});
    const onStop = () => rejectAbort(job.controller.signal.reason as IntentError);
    job.controller.signal.addEventListener('abort', onStop, {once: true});
    const onAbort = () => job.controller.abort(new IntentError('REQUEST_ABORTED'));
    signal?.addEventListener('abort', onAbort, {once: true});
    const timer = this.timeoutMs ? setTimeout(() => job.controller.abort(new IntentError('MODEL_TIMEOUT')), this.timeoutMs) : undefined;
    const started = performance.now(), budget = new ValidationBudget(this.limits.maxValidationChecks);
    const alive = () => {if (job.controller.signal.aborted) throw job.controller.signal.reason;};
    const work = (async () => {
      alive(); let reply: ModelReply;
      try { reply = await this.executor!.generate({instructions: INSTRUCTIONS, input: cloneJson(input) as unknown as JsonObject, outputSchema: cloneJson(CANDIDATE_SCHEMA), signal: job.controller.signal}); }
      catch (cause) {alive(); if (cause instanceof IntentError && ['MODEL_AUTH_FAILED', 'MODEL_RATE_LIMITED', 'MODEL_TIMEOUT', 'MODEL_REQUEST_FAILED', 'MODEL_REFUSED', 'MODEL_OUTPUT_INCOMPLETE'].includes(cause.code)) throw new IntentError(cause.code, {stage: 'model', cause}); throw new IntentError('MODEL_REQUEST_FAILED', {cause});}
      alive();
      if (reply?.outcome === 'refusal') fail('MODEL_REFUSED'); if (reply?.outcome === 'incomplete') fail('MODEL_OUTPUT_INCOMPLETE');
      if (reply?.outcome !== 'complete' || typeof reply.text !== 'string' || !reply.text.trim()) violation();
      const bytes = Buffer.byteLength(reply.text); if (bytes > this.limits.maxOutputBytes) throw new IntentError('RESOURCE_LIMIT', {stage: 'validation', details: {limit: 'maxOutputBytes', allowed: this.limits.maxOutputBytes, observed: bytes, unit: 'bytes'}});
      let decoded; try { decoded = decodeJson(reply.text, this.limits.maxDepth); } catch (cause) { if (cause instanceof IntentError) throw cause; return violation(); }
      measure(decoded, {maxBytes: this.limits.maxOutputBytes, maxDepth: this.limits.maxDepth, limit: 'maxOutputBytes', stage: 'validation', invalid: 'MODEL_OUTPUT_INVALID'});
      this.contracts.candidate(CANDIDATE_SCHEMA, decoded); const draft = decoded as unknown as CandidateDraft;
      const materials = {...this.staticMaterials, ...input.request}; delete (materials as Record<string, unknown>).language;
      const needsValidation = selected.length || flags.extensions || draft.observations.length || draft.nodes.some(n => n.priorRef) || input.request.baseline !== undefined;
      const checked = needsValidation ? await this.runner.run({draft, materials, ...(this.schema ? {schema: this.schema.declaration} : {}), ...(this.extension ? {extension: this.extension.declaration} : {}), selection: selected, extensions: flags.extensions, maxBytes: this.limits.maxOutputBytes, maxSchemaBytes: this.limits.maxSchemaBytes, maxDepth: this.limits.maxDepth, maxChecks: budget.max, used: budget.used}, job.controller.signal) : {values: [], issues: [], used: 0}; alive();
      budget.used = checked.used;
      const result = assemble(draft, materials, checked.values, checked.issues, flags);
      invariants(result, draft);
      if (flags.diagnostics) result.diagnostics = {durationMs: performance.now() - started, modelCallCount: 1};
      if (!this.contracts.valid(INTENT_RESULT_SCHEMA, result)) throw new IntentError('INTERNAL_PROCESSING_FAILED', {stage: 'output'});
      measure(result, {maxBytes: this.limits.maxOutputBytes, maxDepth: this.limits.maxDepth, limit: 'maxOutputBytes', stage: 'output'}); alive(); return result;
    })();
    work.then(() => {job.physicalDone = true; release();}, () => {job.physicalDone = true; release();});
    try {return await Promise.race([work, stopped]);}
    catch (cause) {if (cause instanceof IntentError) throw cause; throw new IntentError('INTERNAL_PROCESSING_FAILED', {stage: 'output', cause});}
    finally {job.logicalDone = true; release(); clearTimeout(timer); signal?.removeEventListener('abort', onAbort); job.controller.signal.removeEventListener('abort', onStop);}
  }
  async dispose(): Promise<void> {
    if (this.disposed) return; this.disposed = true;
    for (const job of this.jobs) job.controller.abort(new IntentError('INSTANCE_DISPOSED'));
    this.runner.close(); this.contracts.close();
  }
}
