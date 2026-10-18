import {Intent, IntentError, type IntentParseRequest} from '@devcodex/intent-runtime';
import {createApiExecutor} from '@devcodex/intent-runtime/adapters/api';

const apiKey = process.env.INTENT_API_KEY;
const model = process.env.INTENT_MODEL;
if (!apiKey || !model) throw new Error('Set INTENT_API_KEY and INTENT_MODEL.');

const intent = new Intent({
  language: 'en',
  executor: createApiExecutor({provider: 'openai', apiKey, model}),
});
const request: IntentParseRequest = {input: 'Look up order 000123. Do not cancel the order.'};
try {
  const result = await intent.parse(request);
  console.log(JSON.stringify(result, null, 2));
  console.log('Goals:', result.effective.intents.map(node => node.goal));
  console.log('Issues:', result.issues.map(issue => issue.message));
} catch (error) {
  if (!(error instanceof IntentError)) throw error;
  console.error(JSON.stringify(error.toJSON()));
  process.exitCode = 1;
} finally {
  await intent.dispose();
}
