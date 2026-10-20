<span id="提取字段与订单号" aria-hidden="true"></span>

# Extract fields

Formal type, range, condition, required-field and finite-dependency checks belong to the core. A matching redundant model diagnosis is combined with the core issue for the same owner, container and field path. Scalar cardinality, uncertain applicability and prose-rule problems remain semantic evidence; they are not discarded because a value has the right JSON type. Resolve suggestions and clarification options using the IDs in the same result, without assuming ID prefixes or duplicate issue counts.

To extract order IDs, amounts, or other business fields, declare rules, select the fields needed for this call, and read values by their field status. For goals and constraints alone, use the [quick start](/guide/quick-start) without a Schema.

<span id="从一个字段开始" aria-hidden="true"></span>
<span id="schema字段和多轮修改" aria-hidden="true"></span>

## Start with one field

Declare orderId as a string and select it in parse. Preserve "000123" and its leading zeros. Complete [installation](/guide/installation) and [model configuration](/guide/quick-start#2-configure-the-model), save this complete file as parse-en.mjs, then run it:

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

```bash
node parse-en.mjs
```

schema-dsl/pure declares a required string; fields selects only orderId. Find the present field report, then its owning intent using intentId. Reading only the first goal is insufficient. See the [Schema reference](/api/schema) for the JSON Schema equivalent and boundaries.

If the user says only “Look up the order,” inspect field status and issues. Do not manufacture an ID from a Schema. See the [complete three-turn example](/examples/index#multi-turn-changes-and-invalidation) for VIP dependencies.

| Input and preconditions | Value location | Check |
|---|---|---|
| Look up order 000123; select string orderId | Owning intent inputs.orderId | present this turn, value "000123" |
| State only the ID; select orderId | turn.facts.orderId | facts ownership and intentId=null; no operation created |
| Amount -5; minimum=0 | Not written into valid inputs | invalid and the associated issue; the intent may still be complete |
| Explicit null note; Schema allows null | note=null in its container | explicit_null, distinct from absence |

Download <a href="/intent-runtime/examples/en/field-states-example.json" download target="_blank" rel="noopener noreferrer">complete field-state material</a>. Applicability also needs evidence; do not force every Schema field onto every intent.

An empty field definition with all selects no fields. New extraction is limited to selected top-level fields. fields=[] does not clear all inherited values. See the [response](/api/response) and [multi-turn guide](/guide/multi-turn).

VIP=true with discount=15 is valid. Changing only VIP=false can invalidate the old 15; later selecting discount and supplying 5 resolves it. A direct change to an unselected old field removes the old value without extracting the unselected replacement. Unchanged, unselected inherited values remain without claiming revalidation.

<span id="多个订单和真假值" aria-hidden="true"></span>

## Multiple orders and falsy values

Locate values using container + intentId + path; see <a href="/intent-runtime/examples/en/two-orders-example.json" download target="_blank" rel="noopener noreferrer">two complete orders</a>. false, 0, and an empty string can be valid. Do not use if(value) as the success check. null is explicit_null only when explicitly supplied and allowed. See all [eight states](/api/response#states-and-consumption).

<span id="支持范围" aria-hidden="true"></span>

## Supported rules

Use the [Schema support matrix](/api/schema#supported-rules). This page covers extraction and consumption.

<span id="格式与定义边界" aria-hidden="true"></span>

## Formats and definition boundaries

See [definition boundaries](/api/schema#formats-and-definition-boundaries), then continue with [Multi-turn changes](/guide/multi-turn).
