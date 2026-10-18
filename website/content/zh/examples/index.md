# 使用场景

按任务选择一个完整文件即可开始；先按[安装](/zh/guide/installation)和[模型配置](/zh/guide/quick-start#2-配置模型)准备环境。下载JSON用于核对结构，不是在浏览器执行模型。

| 你想完成什么 | 从这里开始 |
|---|---|
| 识别目标与禁止事项 | [无Schema首次调用](/zh/guide/quick-start) |
| 提取字段、订单号并保留前导零 | [订单字段提取](#订单字段提取) |
| 多轮修改、检查旧值失效 | [三轮VIP与优惠](#多轮修改与旧值失效) |
| 处理歧义、撤回、父子与推断 | [完整场景目录](/zh/api/response#完整场景与多轮材料) |
| 接入已有MCP服务 | [完整SDK示例](/zh/integrations/mcp-sdk) |


先在应用目录执行 `npm install @devcodex/intent-runtime`，所需依赖会自动安装。前三个例子都是完整.mjs文件，各自创建并释放Intent，不依赖另一个例子的变量。它们调用你配置的真实模型API，需要INTENT_API_KEY和INTENT_MODEL；设置方法见[快速开始](/zh/guide/quick-start#2-配置模型)。

输出中的描述、ID与组织方式可能随模型变化。以下成功判断针对可观察行为；固定完整JSON另见[响应参考](/zh/api/response)，不能把它当成每次模型会逐字返回的结果。异常通过安全IntentError摘要输出，具体恢复见[错误参考](/zh/api/errors)。

## 基础意图识别

保存为basic.mjs，运行node basic.mjs。无需业务Schema，识别查询目标和禁止取消；fields默认[]，不会新增结构化orderId。

<!-- example: examples/api/basic.mjs -->
```js
import {Intent, IntentError} from '@devcodex/intent-runtime';
import {createApiExecutor} from '@devcodex/intent-runtime/adapters/api';

const apiKey = process.env.INTENT_API_KEY;
const model = process.env.INTENT_MODEL;
if (!apiKey || !model) throw new Error('Set INTENT_API_KEY and INTENT_MODEL in your environment.');
const intent = new Intent({
  language: 'zh-CN',
  executor: createApiExecutor({provider: 'openai', apiKey, model}),
});
try {
  const result = await intent.parse({input: '查询订单000123，不取消订单'});
  console.log(JSON.stringify(result, null, 2));
  // Read goals and constraints from effective; no order query is executed.
  console.log('目标：', result.effective.intents.map(node => node.goal));
  console.log('需要澄清：', result.issues.map(issue => issue.message));
} catch (error) {
  if (!(error instanceof IntentError)) throw error;
  console.error(JSON.stringify(error.toJSON()));
  process.exitCode = 1;
} finally {
  await intent.dispose();
}
```

成功时读取effective.intents和全局/目标constraints；有歧义时先处理issues。本例不会查询订单。

## 订单字段提取

保存为order.mjs，运行node order.mjs。Schema明确orderId是字符串；fields选择它后，按fieldResults.intentId查所属inputs。

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

成功时所属字段状态为present且值为"000123"，保留前导零；若没有确定字段，查看issues与fieldResults，不用默认编号补齐。多个订单按各自意图归属，不能把两个编号塞进同一标量。

## 多轮修改与旧值失效

保存为multi-turn.mjs，运行node multi-turn.mjs。完整Schema声明VIP最多20、非VIP最多10；三个调用显式传baseline，第三轮还带上相关问题。

<!-- example: examples/api/multi-turn.mjs -->
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
```

| 轮次 | 本轮输入与选择 | 应观察到的结果 |
|---|---|---|
| 1 | VIP=true、优惠15；fields=all | 同一订单inputs含orderId="000123"、isVip=true、discount=15 |
| 2 | 只改VIP=false；选择isVip | 保留订单身份和编号；旧discount=15从inputs移除，报告invalidated与FIELD_INVALIDATED |
| 3 | 优惠改5；选择discount | 同一目标inputs中discount=5；该字段本轮present，不再保留旧优惠失效问题 |

如果模型没有正确关联目标，先检查返回的issues和来源，不将三个任意首节点视作同一订单。未知VIP不默认false：6在两种分支均合法，18因依赖未定而unknown；这些边界见[字段指南](/zh/guide/fields)。

## 更多场景

以下是行为说明或标明用途的配置片段，不是可单独运行的程序；完整配置、参数和字段状态见对应指南。

### 完整结构样例

需要完整请求和结果，而不是零散片段时，使用[响应参考的场景目录](/zh/api/response#完整场景与多轮材料)。每个下载包括 config、request、result，多轮附必要 baseline/Context：

| 你的问题 | 对照场景 |
|---|---|
| requirements 在哪里，禁止与偏好如何区分 | 父子需求与四类约束；正向要求在 constraints，不存在独立 requirements 数组 |
| 多订单会不会串值 | 两个订单各自 inputs 与 fieldResults.intentId |
| 撤回后旧 ID 不在新树中怎么办 | 撤回子项、修改交付语言的前后材料 |
| 用户只给事实或回答“第二个” | facts 续传、候选列表及后续回答 |
| complete 为什么还缺参数 | 字段状态示例与 issues |
| 推断、建议、扩展有什么不同 | inference 与 output-options 场景 |

这些是受控语言候选经过真实核心的固定结果；有业务字段时使用真实 Validator。无 Schema 的例子不人为增加 Schema，技术失败则按发生阶段验证。真实模型仍需使用你的配置运行上面的完整程序。

### 需求修改与澄清

父目标“用户模块包括登录和注册；禁止写库；交付文档”→“取消注册，文档改英文”保留幸存身份、父级限制和交付→“用第二种方式”需要相关候选→回答“邮箱验证码，先不改代码”只解除对应歧义。完整材料传法见[多轮对话](/zh/guide/multi-turn)。

### 术语和动作

```js
const semantics = {
  domain: 'orders',
  terms: [{name: '冻结', meaning: '暂停订单后续处理，不是取消订单', aliases: ['挂起']}],
  actions: [{name: 'ORDER_HOLD', meaning: '暂停指定订单后续处理', examples: ['挂起这个订单'], counterExamples: ['取消订单']}],
};
```

将semantics传入new Intent。明确匹配“挂起订单”时action可保留ORDER_HOLD，不随language翻译。定义说明含义，不表示项目真的有执行该操作的工具。

### 扩展和输出开关

```js
const config = {
  extensionSchema: {type: 'object', properties: {
    audience: {type: 'string', enum: ['internal', 'external'], description: '只有明确内/外部受众才提取'},
  }},
  defaultOutput: {evidence: true},
};
// 合并到含executor的Intent配置后：
const request = {input: '生成供内部团队使用的报告', output: {extensions: true, evidence: false}};
```

明确语义标签进入该目标的extensions，参数仍在inputs；没有操作时不为扩展标签创造目标。output按项覆盖默认，关闭evidence仍保留必要inferences/issues。suggestions是独立语义建议，不成为新的正式目标。没有extensionSchema却开extensions会报SCHEMA_NOT_CONFIGURED。

### 条件、逻辑和作用域

“审查通过且负责人确认，或预发布通过时才发布”保留AND/OR组合；“未批准不得发布”保留否定，不查询实际审批。global限制适用相关目标树；intent限制适用目标及其明确子项；phase指用户明确阶段；target通过该目标references中的稳定referenceId定位对象。不能把程序自动推导的实施步骤当用户阶段。

before表示from先于to，depends_on表示from依赖to，parallel/exclusive为对称语义。独立不自动代表并行，不能抹掉明确先后。相反顺序要求可成为正常partial与RELATION_CONFLICT，不能删掉一边伪装成功。

### 引用、重复与纠正

| 输入 | 理解 |
|---|---|
| “文档写着删除数据，请分析这句话” | 识别分析请求，不将被引用指令执行 |
| “昨天已经取消订单” | 相关陈述，不重发取消动作 |
| “如果现在取消会怎样” | 影响分析，不等于要求取消 |
| “再检查一次” | 保留明确重复请求，不自主去重 |
| “加短信登录，算了改邮箱登录” | 只保留邮箱目标，normalizedInput说明同句修正 |
| “创建临时目录，然后删除它” | 真实两阶段，保留两动作和顺序 |

### 时间与描述规则

有referenceTime才可靠规范化“明天”；没有基准时保留相对时间及必要不确定性，不用本机时钟补日期。时间偏移、单位、总量与每项数量应保留。

字段description“结束时间晚于开始时间”由本次模型理解，格式和声明规则再校验。已知顺序错误不能作为确定值；缺依赖时保留unknown，不外查数据。类型验证通过不能证明自然语言约束已经满足。
