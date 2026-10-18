<span id="使用场景" aria-hidden="true"></span>

# Usage examples

Pick one complete file for your task. Prepare [installation](/guide/installation) and [model configuration](/guide/quick-start#2-configure-the-model). JSON downloads are for inspecting structure, not calling models in the browser.

| Your task | Start here |
|---|---|
| Recognize a goal and prohibition | [No-Schema quick start](/guide/quick-start) |
| Extract an order ID with leading zeros | [Order ID](#extract-an-order-id) |
| Change conditions and invalidate old values | [Three-turn VIP example](#multi-turn-changes-and-invalidation) |
| Ambiguity, withdrawal, hierarchy, inference | [Complete scenario catalog](/api/response#complete-scenarios-and-multi-turn-material) |
| Existing MCP service | [Complete SDK example](/integrations/mcp-sdk) |

Install with npm install @devcodex/intent-runtime; required dependencies are automatic. The first three examples are complete ESM files, each creating and disposing its own Intent. They call your configured real model API and require INTENT_API_KEY and INTENT_MODEL.

Model wording, IDs, and organization may vary. Verify observable behavior below. [Fixed full JSON](/api/response) is not a promise of verbatim output. Failures print a safe IntentError summary; see [Recovery](/api/errors).

<span id="基础意图识别" aria-hidden="true"></span>

## Basic intent recognition

Save as basic-en.mjs and run node basic-en.mjs. No business Schema is needed. fields defaults to [], so no structured orderId is newly extracted.

<!-- example: examples/api/basic-en.mjs -->
```js
import {Intent, IntentError} from '@devcodex/intent-runtime';
import {createApiExecutor} from '@devcodex/intent-runtime/adapters/api';

const apiKey = process.env.INTENT_API_KEY;
const model = process.env.INTENT_MODEL;
if (!apiKey || !model) throw new Error('Set INTENT_API_KEY and INTENT_MODEL in your environment.');
const intent = new Intent({
  language: 'en',
  executor: createApiExecutor({provider: 'openai', apiKey, model}),
});
try {
  const result = await intent.parse({input: 'Look up order 000123. Do not cancel the order.'});
  console.log(JSON.stringify(result, null, 2));
  // Read goals and constraints from effective; no order query is executed.
  console.log('Goals:', result.effective.intents.map(node => node.goal));
  console.log('Issues:', result.issues.map(issue => issue.message));
} catch (error) {
  if (!(error instanceof IntentError)) throw error;
  console.error(JSON.stringify(error.toJSON()));
  process.exitCode = 1;
} finally {
  await intent.dispose();
}
```

Read effective.intents plus global/per-intent constraints. Resolve issues before assuming a specific interpretation. This example does not query an order.

<span id="订单字段提取" aria-hidden="true"></span>

## Extract an order ID

Save as parse-en.mjs and run node parse-en.mjs. The Schema declares a string. After selection, use fieldResults.intentId to locate the owning inputs.

<!-- example: examples/api/parse-en.mjs -->
```js
import {Intent, IntentError} from '@devcodex/intent-runtime';
import {createApiExecutor} from '@devcodex/intent-runtime/adapters/api';
import {s} from 'schema-dsl/pure';

const apiKey = process.env.INTENT_API_KEY, model = process.env.INTENT_MODEL;
if (!apiKey || !model) throw new Error('Set INTENT_API_KEY and INTENT_MODEL in your environment.');
const intent = new Intent({language: 'en', executor: createApiExecutor({provider: 'openai', apiKey, model}), schema: s({orderId: s('string!').description('An order ID explicitly supplied by the user; preserve leading zeros')})});
function flatten(nodes) {return nodes.flatMap(node => [node, ...flatten(node.children)]);}
try {
  const result = await intent.parse({input: 'Look up order 000123. Do not cancel the order.', fields: ['orderId']});
  console.log(JSON.stringify(result, null, 2));
  const field = result.fieldResults.find(f => f.container === 'inputs' && f.field === 'orderId' && f.status === 'present');
  const owner = field && flatten(result.effective.intents).find(node => node.id === field.intentId);
  if (owner) console.log('Order ID:', owner.inputs.orderId);
  // The application decides what to do next; this example does not query or cancel orders.
} catch (error) {
  if (!(error instanceof IntentError)) throw error;
  console.error(JSON.stringify(error.toJSON()));
  process.exitCode = 1;
} finally {await intent.dispose();}
```

A successful selected field is present with value "000123", retaining leading zeros. If no definite value is available, inspect issues and fieldResults rather than filling a default ID. Multiple orders retain separate owners; do not put two IDs into one scalar field.

<span id="多轮修改与旧值失效" aria-hidden="true"></span>

## Multi-turn changes and invalidation

Save as multi-turn-en.mjs and run node multi-turn-en.mjs. The complete Schema allows a discount up to 20 for VIP and 10 for non-VIP. Each continuation supplies baseline; turn three also carries relevant issues.

<!-- example: examples/api/multi-turn-en.mjs -->
```js
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
const intent = new Intent({language: 'en', schema, executor: createApiExecutor({provider: 'openai', apiKey, model})});
function show(turn, result) {
  console.log(JSON.stringify({turn, intents: result.effective.intents, fields: result.fieldResults, issues: result.issues}, null, 2));
}
try {
  let result = await intent.parse({input: 'Set VIP=true and discount=15 for order 000123', fields: 'all'});
  show(1, result);
  result = await intent.parse({input: 'Change this order to non-VIP; keep everything else', fields: ['isVip'], baseline: result.effective});
  show(2, result);
  result = await intent.parse({input: 'Change the discount to 5', fields: ['discount'], baseline: result.effective, context: {previousIssues: result.issues}});
  show(3, result);
} catch (error) {
  if (!(error instanceof IntentError)) throw error;
  console.error(JSON.stringify(error.toJSON()));
  process.exitCode = 1;
} finally {await intent.dispose();}
```

| Turn | Current input/selection | Expected result |
|---|---|---|
| 1 | VIP=true, discount=15; fields=all | Same order has orderId="000123", isVip=true, discount=15 |
| 2 | Change only VIP=false; select isVip | Retain identity/ID; remove old discount=15 and report invalidated/FIELD_INVALIDATED |
| 3 | Discount=5; select discount | Same goal has discount=5, present this turn, without its previous invalidation issue |

If the model fails to link goals correctly, inspect issues and sources rather than assuming three arbitrary first nodes are the same order. Unknown VIP does not default to false: discount 6 is legal in either branch, while 18 depends on VIP and remains unknown. See [Fields](/guide/fields).

<span id="更多场景" aria-hidden="true"></span>

## More scenarios

The following explain behavior or provide configuration fragments; they are not standalone programs.

<span id="完整结构样例" aria-hidden="true"></span>

### Complete structural examples

The [response catalog](/api/response#complete-scenarios-and-multi-turn-material) includes full config/request/result, with baseline/context when needed.

| Question | Scenario |
|---|---|
| Where are requirements, prohibitions, and preferences? | Parent/child goals and four constraint kinds; no separate requirements array |
| Can order IDs cross between goals? | Two orders, separate inputs and fieldResults.intentId |
| What if a withdrawn ID is absent from the new tree? | Child withdrawal and deliverable-language change |
| A fact only, or “the second one”? | Explicit facts continuation, candidate lists, and answers |
| Why can complete still lack valid parameters? | Field states and issues |
| How do inference, suggestions, and extensions differ? | inference and output-options examples |

Fixed language candidates go through the actual core, with real Validator checks for business fields. No-Schema scenarios do not artificially add one. Technical failures are tested at their own stage. Run the complete API programs with your actual model configuration to assess language understanding.

<span id="需求修改与澄清" aria-hidden="true"></span>

### Requirement changes and clarification

“User module with sign-in and registration; do not modify the database; deliver instructions” → “withdraw registration and change instructions to English” retains surviving identity, parent constraints, and deliverables. “Use the second method” needs its candidates. “Email verification; do not modify code yet” resolves only the relevant ambiguity. See [Multi-turn material](/guide/multi-turn).

<span id="术语和动作" aria-hidden="true"></span>

### Terms and actions

```js
const semantics = {
  domain: 'orders',
  terms: [{name: 'hold', meaning: 'Pause further order processing without cancelling the order', aliases: ['suspend']}],
  actions: [{name: 'ORDER_HOLD', meaning: 'Pause further processing of the specified order', examples: ['Put this order on hold'], counterExamples: ['Cancel the order']}],
};
```

Pass semantics to new Intent. An explicit match can retain ORDER_HOLD regardless of language. Definitions describe meaning; they do not assert that your application has a tool to execute it.

<span id="扩展和输出开关" aria-hidden="true"></span>

### Extensions and output switches

```js
const config = {
  extensionSchema: {type: 'object', properties: {
    audience: {type: 'string', enum: ['internal', 'external'], description: 'Extract only an explicit internal or external audience'},
  }},
  defaultOutput: {evidence: true},
};
// Merge config into an Intent configuration with an executor:
const request = {input: 'Generate a report for the internal team', output: {extensions: true, evidence: false}};
```

Explicit semantic labels go into the owning intent's extensions; business parameters remain in inputs. Do not invent a goal solely to hold extension labels. output overrides defaults per key. Disabling evidence retains necessary issue/inference sources. suggestions remains independent advice rather than a new formal goal. Enabling extensions without extensionSchema produces SCHEMA_NOT_CONFIGURED.

<span id="条件逻辑和作用域" aria-hidden="true"></span>

### Conditions, logic, and scope

“Publish only when review passes AND the owner confirms, OR staging passes” retains the AND/OR grouping. “Do not publish without approval” retains negation without querying actual approval. global constraints apply to the relevant tree; intent constraints apply to the goal and explicit descendants; phase means a user-expressed phase; target uses stable referenceId in that goal's references. Automatically derived implementation steps are not user phases.

before means from precedes to; depends_on means from depends on to; parallel/exclusive are symmetric. Independence does not imply parallelism or remove explicit order. Opposite ordering requirements may produce normal partial/RELATION_CONFLICT; do not erase one to claim success.

<span id="引用重复与纠正" aria-hidden="true"></span>

### Quotes, repetition, and corrections

| Input | Interpretation |
|---|---|
| “The document says delete data; analyze that sentence” | Analysis request, not execution of the quotation |
| “The order was cancelled yesterday” | Relevant statement; no reissued cancellation |
| “What happens if I cancel now?” | Impact analysis, not a cancellation request |
| “Check it again” | Retain an explicit repeated request rather than silently deduplicating |
| “Add SMS sign-in—actually use email sign-in” | Retain email and explain the same-message correction in normalizedInput |
| “Create a temporary directory, then delete it” | Two actual phases with actions and ordering retained |

<span id="时间与描述规则" aria-hidden="true"></span>

### Time and descriptive rules

Normalize “tomorrow” reliably only with referenceTime. Without a reference, preserve relative time and uncertainty rather than inserting the local date. Retain offsets, units, totals, and per-item quantities.

A field description such as “end time must be after start time” is interpreted by the same model call, followed by format/declarative validation. A known wrong ordering is not a definite usable value. Missing dependencies remain unknown without external lookup. Passing a type check does not establish satisfaction of natural-language constraints.
