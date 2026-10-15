import {Intent, IntentError} from '@devcodex/intent-runtime';
import {createApiExecutor} from '@devcodex/intent-runtime/adapters/api';
import {s} from 'schema-dsl/pure';

const apiKey = process.env.INTENT_API_KEY, model = process.env.INTENT_MODEL;
if (!apiKey || !model) throw new Error('Set INTENT_API_KEY and INTENT_MODEL in your environment.');
const intent = new Intent({language: 'zh-CN', executor: createApiExecutor({provider: 'openai', apiKey, model}), schema: s({orderId: s('string!').description('用户明确给出的订单编号，保留前导零')})});
function flatten(nodes) {return nodes.flatMap(node => [node, ...flatten(node.children)]);}
try {
  const result = await intent.parse({input: '查询订单000123，不取消订单', fields: ['orderId']});
  console.log(JSON.stringify(result, null, 2));
  const field = result.fieldResults.find(f => f.container === 'inputs' && f.field === 'orderId' && f.status === 'present');
  const owner = field && flatten(result.effective.intents).find(node => node.id === field.intentId);
  if (owner) console.log('识别到的订单编号：', owner.inputs.orderId);
  // 应用在这里决定如何处理结果；这个例子不查询或取消订单。
} catch (error) {
  if (!(error instanceof IntentError)) throw error;
  console.error(JSON.stringify(error.toJSON()));
  process.exitCode = 1;
} finally {await intent.dispose();}
