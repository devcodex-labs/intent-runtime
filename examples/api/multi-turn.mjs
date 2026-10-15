import {Intent, IntentError} from '@devcodex/intent-runtime';
import {createApiExecutor} from '@devcodex/intent-runtime/adapters/api';

const apiKey = process.env.INTENT_API_KEY, model = process.env.INTENT_MODEL;
if (!apiKey || !model) throw new Error('Set INTENT_API_KEY and INTENT_MODEL in your environment.');
const schema = {
  type: 'object',
  properties: {orderId: {type: 'string', pattern: '^[0-9]+$'}, isVip: {type: 'boolean'}, discount: {type: 'number', minimum: 0}},
  if: {properties: {isVip: {const: true}}, required: ['isVip']},
  then: {properties: {discount: {maximum: 20}}},
  else: {properties: {discount: {maximum: 10}}},
};
const intent = new Intent({language: 'zh-CN', schema, executor: createApiExecutor({provider: 'openai', apiKey, model})});
function show(turn, result) {
  console.log(JSON.stringify({turn, intents: result.effective.intents, fields: result.fieldResults, issues: result.issues}, null, 2));
}
try {
  let result = await intent.parse({input: '为订单000123设置VIP=true，优惠15', fields: 'all'});
  show(1, result);
  result = await intent.parse({input: '这个订单改为非VIP，其他不变', fields: ['isVip'], baseline: result.effective});
  show(2, result);
  result = await intent.parse({input: '优惠改为5', fields: ['discount'], baseline: result.effective, context: {previousIssues: result.issues}});
  show(3, result);
} catch (error) {
  if (!(error instanceof IntentError)) throw error;
  console.error(JSON.stringify(error.toJSON()));
  process.exitCode = 1;
} finally {await intent.dispose();}
