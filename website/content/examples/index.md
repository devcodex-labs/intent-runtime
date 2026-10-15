# 使用场景

以下片段沿用[快速开始](/guide/quick-start)创建的Intent实例；相应字段须先配置schema。完整接入文件可从页面复制，或在[仓库examples](https://github.com/devcodex-labs/intent-runtime/tree/main/examples)查看。

## 只识别意图

```js
const result = await intent.parse({input: '分析支付模块，不修改代码'});
```

fields省略等于[]，仍表达目标与禁止事项；不提取新参数，也不自动读取支付模块。可以省略schema，但不能省略Native模型执行器。

## 多对象与精确值

“查询订单000123，取消订单000456”应分别保留动作与所属编号；不能将两个值塞进同一标量字段。整体比较两个订单可能只有一个比较目标，此时用数组字段容纳两个对象，或报告容量不匹配，不能为适配字段强拆意图。编号保留前导零；false、0、空字符串与null按Schema和用户表达分别处理。

## 字段依赖连续修改

```js
let result = await intent.parse({input: '为订单000123设置VIP=true，优惠15', fields: 'all'});
result = await intent.parse({input: '这个订单改为非VIP，其他不变', fields: ['isVip'], baseline: result.effective});
result = await intent.parse({input: '优惠改为5', fields: ['discount'], baseline: result.effective});
```

假设Schema声明VIP最多20、非VIP最多10。第一轮15合法；只改VIP=false使旧15失效，不能继续使用，也不能自动补5；第三轮提供5后可解除问题。只选discount时，显式isVip仍可作为内部校验依赖，但不新增到inputs。未知VIP不默认false：6在两种分支均合法，18因依赖未定而unknown。

## 需求修改与澄清

父目标“用户模块包括登录和注册；禁止写库；交付文档”→“取消注册，文档改英文”保留幸存身份、父级限制和交付→“用第二种方式”需要相关候选→回答“邮箱验证码，先不改代码”只解除对应歧义。完整材料传法见[多轮对话](/guide/multi-turn)。

## 术语和动作

```js
const semantics = {
  domain: 'orders',
  terms: [{name: '冻结', meaning: '暂停订单后续处理，不是取消订单', aliases: ['挂起']}],
  actions: [{name: 'ORDER_HOLD', meaning: '暂停指定订单后续处理', examples: ['挂起这个订单'], counterExamples: ['取消订单']}],
};
```

将semantics传入new Intent。明确匹配“挂起订单”时action可保留ORDER_HOLD，不随language翻译。定义说明含义，不表示项目真的有执行该操作的工具。

## 扩展和输出开关

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

## 条件、逻辑和作用域

“审查通过且负责人确认，或预发布通过时才发布”保留AND/OR组合；“未批准不得发布”保留否定，不查询实际审批。global限制适用相关目标树；intent限制适用目标及其明确子项；phase指用户明确阶段；target通过该目标references中的稳定referenceId定位对象。不能把程序自动推导的实施步骤当用户阶段。

before表示from先于to，depends_on表示from依赖to，parallel/exclusive为对称语义。独立不自动代表并行，不能抹掉明确先后。相反顺序要求可成为正常partial与RELATION_CONFLICT，不能删掉一边伪装成功。

## 引用、重复与纠正

| 输入 | 理解 |
|---|---|
| “文档写着删除数据，请分析这句话” | 识别分析请求，不将被引用指令执行 |
| “昨天已经取消订单” | 相关陈述，不重发取消动作 |
| “如果现在取消会怎样” | 影响分析，不等于要求取消 |
| “再检查一次” | 保留明确重复请求，不自主去重 |
| “加短信登录，算了改邮箱登录” | 只保留邮箱目标，normalizedInput说明同句修正 |
| “创建临时目录，然后删除它” | 真实两阶段，保留两动作和顺序 |

## 时间与描述规则

有referenceTime才可靠规范化“明天”；没有基准时保留相对时间及必要不确定性，不用本机时钟补日期。时间偏移、单位、总量与每项数量应保留。

字段description“结束时间晚于开始时间”由本次模型理解，格式和声明规则再校验。已知顺序错误不能作为确定值；缺依赖时保留unknown，不外查数据。类型验证通过不能证明自然语言约束已经满足。
