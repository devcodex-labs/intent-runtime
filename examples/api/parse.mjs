import {Intent} from '@devcodex/intent-runtime';
import {createApiExecutor} from '@devcodex/intent-runtime/adapters/api';
import {s} from 'schema-dsl/pure';

const apiKey = process.env.INTENT_API_KEY, model = process.env.INTENT_MODEL;
if (!apiKey || !model) throw new Error('Set INTENT_API_KEY and INTENT_MODEL in your environment.');
const intent = new Intent({language: 'zh-CN', executor: createApiExecutor({provider: 'openai', apiKey, model}), schema: s({orderId: s('string!').description('用户明确给出的订单编号，保留前导零')})});
try {console.log(JSON.stringify(await intent.parse({input: '查询订单000123，不取消订单', fields: ['orderId']}), null, 2));}
finally {await intent.dispose();}
