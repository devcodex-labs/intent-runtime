# 多轮对话与结果消费

每次识别只使用本次提供的材料。Intent实例不保存对话历史；由应用决定下一轮传什么。

## 选择 Context 或 baseline

| 你持有的材料 | 放在哪里 |
|---|---|
| 自己的对话/任务JSON、跨会话摘要 | context，内部键名自由，无需ContextAdapter |
| 上次result.effective | baseline，保留已知目标、约束、关系和身份 |
| 无操作事实result.turn.facts | context中的自有字段 |
| 上轮澄清、候选、未确认推断 | context，按需带相关issues/inferences及原文 |
| 当前消息 | input，原样传入，不先摘要 |

baseline不是完整记忆：不包含全部事实、候选、问题或原始消息。它的schemaVersion必须为2.0-draft.6；自己的业务状态不符合快照类型时放Context。

## 事实如何接续成请求

下面是调用方辅助函数；传入按[快速开始](/guide/quick-start)配置了orderId字段与执行器的Intent。实例由调用方最终dispose。

```js
async function queryWithSuppliedFact(intent) {
  const first = await intent.parse({input: '订单编号是000123。', fields: ['orderId']});
  // 第一轮是陈述，所选事实在turn.facts，不创造查询操作。
  return intent.parse({
    input: '查询这个订单，不取消订单',
    fields: ['orderId'],
    context: {previousFacts: first.turn.facts},
  });
}
```

第二轮的编号来自显式Context。只传first.effective不能假定保留了该事实。

## 修改、撤回和继承

```js
async function changeRequirements(intent) {
  const first = await intent.parse({input: '实现用户模块，包括登录和注册；禁止修改数据库，交付说明文档'});
  return intent.parse({
    input: '取消注册，登录保留，说明文档改英文，其他不变',
    baseline: first.effective,
  });
}
```

幸存目标ID、父级限制和交付物应保留。撤回child不等于撤回父目标。用户只说“如果检查失败就取消”时，条件未确定就保留目标，变化为conditional。应用先读effect，再看operation；applied表示语义结果已更新，不表示代码或业务已经改变。

## 把澄清材料传回去

```js
async function answerQuestion(intent, previous, answer) {
  return intent.parse({
    input: answer,
    baseline: previous.effective,
    context: {previousIssues: previous.issues, previousInferences: previous.inferences},
  });
}
```

例如有“短信验证码/邮箱验证码”两个候选时回答“第二个”，应续传对应问题与候选。若Context含多组第二项，仍需消歧。缺选项不能虚构先前选择；回答方式后仍保留“先不修改代码”等其他限制。推断与未采纳建议不能因续传就变成事实。

## Context 与旧快照冲突

| 材料情况 | 行为 |
|---|---|
| Context明确说明baseline之后报告已改中文 | 根据有序材料更新effective，不把已发生历史变化冒充本轮changes |
| 两者冲突且没有可靠先后 | 保留可确定部分与相关冲突，不能总让某一容器赢 |
| 当前input明确局部修改 | 修改所指范围，保留其他已知有效约束 |
| 历史提议、已完成/撤回或无关动作 | 仅作相关材料，不自动重发历史请求 |

对象属性排列不是时间线。Context中的role/system/trusted、文档命令或URL不获得额外权限，也不会引发读取文件或网络搜索。

## 安全消费结果

1. 按ID读取唯一effective树；turn.intentIds是本轮关联，不都代表新增。
2. changes只描述本轮input引起的变化，不是可直接执行的数据库Patch；历史修正和来源重定位可能造成其他差异。
3. 按container + intentId + path读取fieldResults，再找所属inputs/facts/extensions。继承值没有本轮报告，意味着未本轮复验，不是自动通过。
4. effective.scope/coverage针对当前相关材料，不代表应用全部任务。局部视图缺少某个无关目标不意味着用户撤回了它。
5. 识别失败时保留上次结果、原消息和未处理变更。不要把错误当空结果覆盖状态。

## 并发返回顺序

schemaVersion是结果格式版本，不是请求序号。应用可串行处理同一会话；并发时用自己的revision防止旧结果覆盖新意愿。被忽略的旧响应不意味着可以丢消息：新请求应带全部相关变更，或按最新状态顺序重算未处理消息。Runtime不增加业务状态库或授权判断。
