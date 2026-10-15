# 如何读取结果

输入“查询订单000123，不取消订单”，首先看查询目标与禁止取消的约束。只有显式配置Schema并选择orderId后，才额外提取字符串编号。

下面是**阅读摘要**，不是精简版API响应。真实结果保留所有必返字段，见[完整响应结构](/api/response)。

| 你关心的问题 | 读取位置 | 本例应表达的含义 |
|---|---|---|
| 用户要做什么 | effective.intents及其children中的goal | 查询订单000123 |
| 有什么限制 | effective.constraints和各意图constraints | 禁止取消订单；同时考虑父级与全局作用域 |
| 提取了哪些参数 | 对应意图的inputs | 选择orderId后保留字符串"000123" |
| 参数能否使用 | fieldResults | 找到对应container、intentId和path的状态 |
| 需要问用户什么 | issues的message、questions、candidates | 按具体问题补充信息，不自行选一个候选 |
| 哪些是推断 | inferences | 检查推断对象、依据及可选candidate，不当作用户确认 |
| 这轮改了什么 | turn.kind、intentIds、changes | 关联本轮目标；changes不是业务执行指令 |

## 按归属读取字段

下面是应用中的辅助函数，不是SDK新增API。它返回本轮已经检查且确定的字段；未出现本轮报告的继承值需要单独按业务规则处理。

```js
function readOrderIds(result) {
  const nodes = new Map();
  function visit(items) {
    for (const node of items) {nodes.set(node.id, node); visit(node.children);}
  }
  visit(result.effective.intents);
  return result.fieldResults
    .filter(field => field.container === 'inputs' && field.path === '/orderId' && field.status === 'present')
    .map(field => ({intentId: field.intentId, orderId: nodes.get(field.intentId)?.inputs.orderId}));
}
```

多个订单要按intentId区分，不能把所有编号写到第一个目标。合法的false、0、空字符串不等于缺失；explicit_null表示明确且Schema允许的null。unknown、invalid、invalidated等状态不提供可直接使用的确定值，详见[字段状态](/api/response#状态与消费规则)。

## 事实、歧义和失败

- “订单编号是000123”是陈述。选中orderId时，值在turn.facts，fieldResults的container为facts、intentId为null；没有查询意图可供执行。
- “处理这个订单”但没有对象材料时，读取issues并向用户澄清。下一轮显式传相关Context；不凭空查找历史。
- status=complete表示当前意图理解的完整度，不保证所有字段齐全或合法，也不表示授权或已执行业务。status=partial仍可能含可确定部分。
- 技术失败通过IntentError或MCP错误信封返回。保存之前的结果与原消息，按[错误与恢复](/api/errors)处理，不用空结果覆盖状态。

## 根据结果决定下一步

| 观察到什么 | 如何处理 | 不应得出的结论 |
|---|---|---|
| complete，所需字段本轮 present/explicit_null | 按归属读取确定值；结合业务要求决定后续 | 不等于获授权或已经执行 |
| complete，但某个字段 invalid/invalidated | 不使用该字段；按相关 issues 修正或补充，再识别 | 不能仅检查根 status 就使用所有参数 |
| partial，含歧义或未解决对象 | 使用已确定部分展示理解，按 questions 澄清 | 不自行选候选、不丢弃其余明确限制 |
| 没有意图，有 turn.facts | 保存或展示所选事实；后续显式续传 | 不凭事实新增查询或设置动作 |
| 有 inferences | 把候选与已确认信息区分，必要时澄清 | 推断不是默认值或用户承诺 |
| 抛异常/MCP isError=true | 按错误码恢复；保留此前状态 | 不是空成功结果，也不应盲目重复调用 |
| 修改或撤回 | 核对 effect 和 scope/coverage，更新对应意图快照 | changes 不是可直接执行的业务 patch |

“补充材料”与“修复配置”是两条路径：用户没给订单号时应澄清；选择 orderId 却没配 Schema 时应修复实例配置。完整前后结果见[场景下载](/api/response#完整场景与多轮材料)。

## 接下一轮

把本次effective作为baseline可保留目标与身份；事实、问题、候选按需放到context。应用负责结果存储、并发顺序、授权和业务动作，见[多轮对话](/guide/multi-turn)。
