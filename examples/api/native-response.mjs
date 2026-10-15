import {Intent, IntentError} from '@devcodex/intent-runtime';
import {createApiExecutor} from '@devcodex/intent-runtime/adapters/api';

const apiKey = process.env.INTENT_API_KEY, model = process.env.INTENT_MODEL;
if (!apiKey || !model) throw new Error('Set INTENT_API_KEY and INTENT_MODEL in your environment.');
const intent = new Intent({
  language: 'zh-CN',
  executor: createApiExecutor({provider: 'openai', apiKey, model}),
  schema: {type: 'object', properties: {orderId: {type: 'string', pattern: '^[0-9]+$'}}},
});
try {
  const result = await intent.parse({input: '查询订单000123，不要取消订单', fields: ['orderId']});
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  if (!(error instanceof IntentError)) throw error;
  console.error(JSON.stringify(error.toJSON()));
  process.exitCode = 1;
} finally {await intent.dispose();}
