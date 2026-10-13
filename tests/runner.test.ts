import test from 'node:test';
import assert from 'node:assert/strict';
import {ValidationRunner, type ValidationTask} from '../src/schema/runner.js';
import {IntentError} from '../src/index.js';
import {draft, observation} from './helpers.js';
function task(value: string): ValidationTask {
  const d = draft(); d.observations = [observation('id', value)];
  return {draft: d, materials: {input: value}, schema: {type: 'object', properties: {id: {type: 'string'}}}, selection: ['id'], extensions: false, maxBytes: 1048576, maxSchemaBytes: 262144, maxDepth: 64, maxChecks: 256, used: 0};
}
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
