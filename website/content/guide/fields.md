# 提取字段与订单号

从用户原文提取订单号、金额或其他业务字段时，先声明规则，再选择本次需要的字段，最后按字段状态读取值。只识别目标与约束时使用[快速开始](/guide/quick-start)，不必配置 Schema。

<a id="schema字段和多轮修改"></a>

## 从一个字段开始

以orderId为例，Schema声明字符串，parse选择该字段；完整可运行文件见[订单字段示例](/examples/index#订单字段提取)。编号"000123"应保留字符串和前导零。

先完成[安装](/guide/installation)和[模型配置](/guide/quick-start#2-配置模型)，将下面完整文件保存为 parse.mjs，再运行 node parse.mjs：

<!-- example: examples/api/parse.mjs -->
```js
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
```

```bash
node parse.mjs
```

本例用 schema-dsl/pure 定义一个必需字符串字段；fields 只选择 orderId。结果中先找到 present 的字段报告，再按 intentId 查所属意图，不能只读取第一个目标。JSON Schema 等价形式与支持边界见[Schema参考](/api/schema)。

如果用户只说“查询订单”而没有编号，读取字段状态及issues，不根据Schema生成编号。VIP依赖的完整配置、三轮调用及结果表见[多轮修改示例](/examples/index#多轮修改与旧值失效)。

| 输入与前提 | 值的位置 | 如何判断 |
|---|---|---|
| 查询订单000123，选择字符串 orderId | 所属意图 inputs.orderId | 本轮 present，值为 "000123" |
| 只陈述编号000123，同样选择 orderId | turn.facts.orderId | facts 归属、intentId=null，不创造查询操作 |
| 金额-5，Schema 声明 minimum=0 | 不写入有效 inputs | invalid 与对应问题；意图本身仍可能 complete |
| 明确备注为 null，Schema 允许 null | 所属容器 note=null | explicit_null，与未提供不同 |

完整配置、请求及结果见<a href="/intent-runtime/examples/field-states-example.json" download target="_blank" rel="noopener noreferrer">字段状态示例</a>。字段是否适用也需要材料依据，不能把每个 Schema 字段都强行套到所有意图上。

空字段定义配all等同无字段选择。新提取只限所选顶层字段；fields=[]不是清空所有继承值。字段状态及值能否保留见[完整响应](/api/response)，跨轮材料见[多轮对话](/guide/multi-turn)。

例如 VIP=true、discount=15 可提取；下一轮只改 VIP=false，旧优惠 15 会失效；再选择 discount 并给 5，可解除问题。直接改变未选旧字段会移除旧值，但不提取未选替代值。未变化、未选择的继承值保留，不声称本轮重新验证。

## 多个订单和真假值

两个订单的订单号各归所属意图，按 container + intentId + path 定位，见<a href="/intent-runtime/examples/two-orders-example.json" download target="_blank" rel="noopener noreferrer">两个订单完整材料</a>。false、0和空字符串可以是合法值，不能用 if(value) 判断是否提取成功；null 只有用户明确提供且规则允许时才是 explicit_null。全部8种状态见[状态与消费规则](/api/response#状态与消费规则)。

## 支持范围

完整规则矩阵已集中到[Schema支持范围](/api/schema#支持范围)，本页只讲提取与消费。

## 格式与定义边界

支持的格式、方言及拒绝方式见[定义边界](/api/schema#格式与定义边界)。下一步看[多轮对话与旧值失效](/guide/multi-turn)。
