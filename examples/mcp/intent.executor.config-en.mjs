import {createApiExecutor} from '@devcodex/intent-runtime/adapters/api';
const apiKey = process.env.INTENT_API_KEY, model = process.env.INTENT_MODEL;
if (!apiKey || !model) throw new Error('Set INTENT_API_KEY and INTENT_MODEL.');
export default {mode: 'executor', instances: {main: {language: 'en', executor: createApiExecutor({provider: 'openai', apiKey, model})}}};
