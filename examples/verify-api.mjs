import assert from 'node:assert/strict';
import path from 'node:path';
import {writeFile, readFile} from 'node:fs/promises';
import {Intent} from '@devcodex/intent-runtime';
import {createApiExecutor} from '@devcodex/intent-runtime/adapters/api';

const [provider, output] = process.argv.slice(2);
if (!['openai','xai'].includes(provider) || !output || !path.isAbsolute(output)) throw new Error('Usage: node verify-api.mjs <openai|xai> <absolute-output.json>');
const apiKey = process.env.INTENT_API_KEY, model = process.env.INTENT_MODEL;
const metadata = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
if (!apiKey || !model) throw new Error('Set model and credentials through environment settings.');
const schema = {type: 'object', properties: {orderId: {type: 'string'}, isVip: {type: 'boolean'}, discount: {type: 'number', minimum: 0}}, if: {properties: {isVip: {const: true}}, required: ['isVip']}, then: {properties: {discount: {maximum: 20}}}, else: {properties: {discount: {maximum: 10}}}};
const intent = new Intent({language: 'zh-CN', schema, executor: createApiExecutor({provider, apiKey, model})});
const records = []; let baseline;
async function run(id, request, verify) {
  try {const result = await intent.parse(request); verify(result); records.push({id, status: 'passed', request, result}); return result;}
  catch (error) {records.push({id, status: 'failed', error: error instanceof Error ? {name: error.name, code: error.code ?? 'ASSERTION_FAILED'} : {code: 'UNKNOWN'}}); throw error;}
}
try {
  await run('leading-zero', {input: '查询订单000123，不取消订单', fields: ['orderId']}, r => assert.equal(r.effective.intents[0]?.inputs.orderId, '000123'));
  await run('separate-orders', {input: '查询订单000123和000456，保留两个订单各自的编号', fields: ['orderId']}, r => assert.deepEqual(r.effective.intents.map(n => n.inputs.orderId), ['000123','000456']));
  baseline = (await run('vip-15', {input: '为订单000123设置VIP=true，优惠15', fields: 'all'}, r => assert.deepEqual(r.effective.intents[0]?.inputs, {orderId: '000123', isVip: true, discount: 15}))).effective;
  baseline = (await run('vip-false-invalidates', {input: '这个订单改为非VIP，其他目标不变', fields: ['isVip'], baseline}, r => {assert.equal(r.effective.intents[0]?.inputs.isVip, false); assert.equal('discount' in r.effective.intents[0].inputs, false); assert(r.fieldResults.some(f => f.field === 'discount' && f.status === 'invalidated'));})).effective;
  await run('discount-5-clears', {input: '优惠改为5', fields: ['discount'], baseline}, r => {assert.equal(r.effective.intents[0]?.inputs.discount, 5); assert(!r.issues.some(i => i.field === 'discount'));});
} finally {
  await intent.dispose();
  await writeFile(output, JSON.stringify({scope: 'actual-provider-field-smoke; independent semantic review still required', provider, model, packageVersion: metadata.version, contractVersion: '2.0-draft.6', executed: records.length, records}, null, 2) + '\n');
}
