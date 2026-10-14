import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {cp, mkdtemp, rename, symlink} from 'node:fs/promises';
import type {Worker} from 'node:worker_threads';
import {ValidationRunner, type ValidationTask} from '../src/schema/runner.js';
import {IntentError} from '../src/index.js';
import {draft, observation} from './helpers.js';
test('Real constructor and worker never print private declaration paths or validation data', () => {
  const entry = pathToFileURL(path.join(process.env.INTENT_PACKAGE_TEST_ROOT!, 'dist/index.js')).href;
  const secretField = 'PRIVATE_DECLARATION_TOKEN';
  const d = {...draft(), observations: [observation(secretField, 4)]};
  const schema = {type: 'object', properties: {isVip: {type: 'boolean'}, [secretField]: {type: 'number'}},
    if: {properties: {isVip: {const: true}}, required: ['isVip']},
    then: {properties: {[secretField]: {maximum: 20}}}, else: {properties: {[secretField]: {maximum: 10}}}};
  const code = `import assert from 'node:assert/strict'; import {Intent} from ${JSON.stringify(entry)};
    const d=${JSON.stringify(d)}, schema=${JSON.stringify(schema)};
    const intent=new Intent({schema,executor:{id:'private-constructor-fixture',async generate(){return {outcome:'complete',text:JSON.stringify(d)};}}});
    try {const r=await intent.parse({input:'set PRIVATE_DECLARATION_TOKEN to 4',fields:['PRIVATE_DECLARATION_TOKEN']});assert.equal(r.effective.intents[0].inputs.PRIVATE_DECLARATION_TOKEN,4);}finally{await intent.dispose();}
    assert.throws(()=>new Intent({schema:{type:'object',properties:{PRIVATE_DECLARATION_TOKEN:{type:'number',minimum:'PRIVATE_RAW_SCHEMA'}}}}),{code:'SCHEMA_INVALID'});`;
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', code], {encoding: 'utf8', timeout: 30000});
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, ''); assert.equal(child.stderr, '');
});
function task(value: string): ValidationTask {
  const d = draft(); d.observations = [observation('id', value)];
  return {draft: d, materials: {input: value}, schema: {type: 'object', properties: {id: {type: 'string'}}}, selection: ['id'], extensions: false, maxBytes: 1048576, maxSchemaBytes: 262144, maxDepth: 64, maxChecks: 256, used: 0};
}
for (const inputType of [['--input-type=module'], ['--input-type', 'module']]) test('File worker works from a Native caller with ' + inputType.join(' '), () => {
  const entry = pathToFileURL(path.join(process.env.INTENT_PACKAGE_TEST_ROOT!, 'dist/index.js')).href;
  const code = `import assert from 'node:assert/strict'; import {Intent} from ${JSON.stringify(entry)};
    const d=${JSON.stringify({...draft(), observations: [observation('id', '000123')]})};
    const intent=new Intent({schema:{type:'object',properties:{id:{type:'string'}}},executor:{id:'stdin-language-boundary',async generate(){return {outcome:'complete',text:JSON.stringify(d)};}}});
    try {const result=await intent.parse({input:'query 000123',fields:['id']});assert.equal(result.effective.intents[0].inputs.id,'000123');assert.equal(result.fieldResults[0].status,'present');} finally {await intent.dispose();}`;
  const child = spawnSync(process.execPath, [...inputType, '--eval', code], {encoding: 'utf8', timeout: 30000});
  assert.equal(child.status, 0, child.stderr);
});
test('Real Validator runner: cancel queued B without killing running A', async () => {
  const runner = new ValidationRunner(), a = new AbortController(), b = new AbortController();
  const first = runner.run(task('A'), a.signal); const second = runner.run(task('B'), b.signal);
  b.abort(new IntentError('REQUEST_ABORTED')); await assert.rejects(second, {code: 'REQUEST_ABORTED'});
  try {const result = await first; assert.equal(result.values[0]!.value, 'A'); assert.equal(result.used, 1);} finally {runner.close();}
});
test('Real Validator runner: cancel running A, wait for exit, then B succeeds', async () => {
  const runner = new ValidationRunner(), a = new AbortController(), b = new AbortController();
  const first = runner.run(task('A'), a.signal), second = runner.run(task('B'), b.signal);
  a.abort(new IntentError('REQUEST_ABORTED')); await assert.rejects(first, {code: 'REQUEST_ABORTED'});
  try {assert.equal((await second).values[0]!.value, 'B');} finally {runner.close();}
});
test('Real Validator runner: dispose resolves all pending failures', async () => {
  const runner = new ValidationRunner(), signal = new AbortController().signal;
  const first = runner.run(task('A'), signal), second = runner.run(task('B'), signal);
  runner.close(); await Promise.all([assert.rejects(first, {code: 'INSTANCE_DISPOSED'}), assert.rejects(second, {code: 'INSTANCE_DISPOSED'})]);
});
test('Existing validation budget remains consumed at real worker boundary', async () => {
  const runner = new ValidationRunner(); const request = task('A'); request.maxChecks = 1; request.used = 1;
  try {await assert.rejects(runner.run(request, new AbortController().signal), (error: unknown) => error instanceof IntentError && error.code === 'RESOURCE_LIMIT' && error.details?.observed === 2);} finally {runner.close();}
});
test('Worker declaration/initialization fault is internal, never blamed on model or caller', async () => {
  const runner = new ValidationRunner(); const request = task('A'); request.schema = {type: 'object', properties: {id: {type: 'unsupported-type'}}};
  try {await assert.rejects(runner.run(request, new AbortController().signal), (error: unknown) => error instanceof IntentError && error.code === 'INTERNAL_PROCESSING_FAILED' && error.stage === 'validation');} finally {runner.close();}
});

test('SC-34/35 unexpected real worker exit fails A, queued B recovers, and a late old validated reply cannot settle B', async () => {
  const runner = new ValidationRunner(), signal = new AbortController().signal;
  try {
    const validatedSeed = await runner.run(task('SEED'), signal);
    const first = runner.run(task('A'), signal);
    const oldWorker = (runner as unknown as {worker: Worker}).worker;
    const second = runner.run(task('B'), signal);
    const failed = assert.rejects(first, (e: unknown) => e instanceof IntentError && e.code === 'INTERNAL_PROCESSING_FAILED' && e.stage === 'validation');
    await oldWorker.terminate(); await failed;
    // Inject a genuine previously validated reply on the old generation's
    // delivery channel after its physical exit and B's replacement starts.
    oldWorker.emit('message', {reply: validatedSeed, used: validatedSeed.used});
    assert.equal((await second).values[0]!.value, 'B');
    assert.equal((await runner.run(task('C'), signal)).values[0]!.value, 'C');
  } finally {await runner.close();}
});

test('SC-35 an actually missing installed worker is internal and a restored resource permits the next parse', async () => {
  const root = await mkdtemp(path.join(process.env.INTENT_TEST_DIR!, 'missing-worker-'));
  const installed = path.join(root, 'package');
  await cp(process.env.INTENT_PACKAGE_TEST_ROOT!, installed, {recursive: true, dereference: false, filter: name => path.basename(name) !== 'node_modules'});
  await symlink(path.resolve('node_modules'), path.join(installed, 'node_modules'), 'junction');
  const worker = path.join(installed, 'dist/schema/worker.mjs');
  await rename(worker, worker + '.saved');
  const entry = pathToFileURL(path.join(installed, 'dist/index.js')).href;
  const {Intent} = await import(entry);
  const d = {...draft(), observations: [observation('id', '000123')]};
  const intent = new Intent({schema: {type: 'object', properties: {id: {type: 'string'}}}, executor: {id: 'actual-missing-resource', async generate() {return {outcome: 'complete' as const, text: JSON.stringify(d)};}}});
  try {
    await assert.rejects(intent.parse({input: 'query 000123', fields: ['id']}), (e: unknown) => (e as IntentError).code === 'INTERNAL_PROCESSING_FAILED' && (e as IntentError).stage === 'validation');
    await rename(worker + '.saved', worker);
    assert.equal((await intent.parse({input: 'query 000123', fields: ['id']})).effective.intents[0].inputs.id, '000123');
  } finally {await intent.dispose();}
});
