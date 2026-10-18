import assert from 'node:assert/strict';
import {readableIds} from './result-check.mjs';
import {english} from './english.mjs';

const src = {root: 'input', pointer: ''};
const change = (key, operation = 'add', targetKind = 'intent') => ({operation, effect: 'applied', targetKind, targetKey: key, conditionKey: null, description: operation === 'add' ? '新增本轮明确请求' : operation === 'withdraw' ? '撤回所指目标' : '只修改本轮指定内容', sources: [src], deltaHints: []});
const node = (key, action, target, parentKey = null) => ({key, parentKey, priorRef: null, domain: null, action, target, goal: action + target, understanding: 'clear', optional: null, expectedOutput: [], sources: [src]});
function draft(nodes = [node('order', '查询', '订单000123')]) {
  return {version: 'candidate-2', kind: 'request', normalizedInput: '', relatedKeys: nodes.map(n => n.key), historyCoverage: 'complete', usedHistory: false,
    messages: {changed: '用户改变了原值，不提取未选择的替代值。', notApplicable: '字段不适用于当前目标。', noValue: '未提供确定值。', noDeclaration: '没有可用于本轮校验的声明。', explicitNull: '用户明确提供null且声明允许。', invalid: '提供值违反声明规则。', open: '本地策略不能建立完整证明。', mixed: '缺少依赖，可能分支的结果不同。', semanticUnknown: '材料不足以确认字段描述关系。', unresolved: '当前材料不足，需要澄清。', relationConflict: '明确先后要求相互冲突。'},
    nodes, constraints: [], references: [], relations: [], priorTargets: [], changes: nodes.map(n => change(n.key)), observations: [], issues: [], inferences: [], evidence: [], suggestions: []};
}
export function simpleCandidate(prohibit = false) {
  const d = draft();
  d.normalizedInput = prohibit ? '查询订单000123，不要取消订单' : '查询订单000123';
  if (prohibit) {d.constraints = [constraint('no-cancel', 'order', 'prohibition', '不要取消订单')]; d.changes.push(change('no-cancel', 'add', 'constraint'));}
  return d;
}
const observation = (field, value, ownerKey = 'order', container = 'inputs', presence = 'known') => ({ownerKey, container, field, presence, withdrawn: false, valueJson: presence === 'known' ? JSON.stringify(value) : null, rawText: null, sources: presence === 'known' ? [src] : [], semantic: null});
const constraint = (key, ownerKey, kind, text) => ({key, priorRef: null, ownerKey, scope: ownerKey ? 'intent' : 'global', referenceKey: null, kind, text, expressionJson: null, sources: [src]});
const orderSchema = {type: 'object', properties: {orderId: {type: 'string', pattern: '^[0-9]+$'}}};
export const vipSchema = {type: 'object', properties: {...orderSchema.properties, isVip: {type: 'boolean'}, discount: {type: 'number', minimum: 0}}, if: {properties: {isVip: {const: true}}, required: ['isVip']}, then: {properties: {discount: {maximum: 20}}}, else: {properties: {discount: {maximum: 10}}}};

export async function buildScenarios({Intent}, locale = 'zh') {
  const cases = [];
  async function run(slug, title, config, request, candidate, check) {
    if (locale === 'en') {title = english(title); config = english(config); request = english(request); candidate = english(candidate);}
    const language = locale === 'en' ? 'en' : 'zh-CN';
    const intent = new Intent({...config, language, executor: {id: 'documentation-language-fixture', async generate() {return {outcome: 'complete', text: JSON.stringify({...candidate, normalizedInput: request.input})};}}});
    try {
      const result = await intent.parse(request); check?.(result);
      cases.push({slug, title, config: {language, ...config}, request, result});
      return result;
    } catch (error) {throw new Error('Documentation scenario failed: ' + slug, {cause: error});}
    finally {await intent.dispose();}
  }
  const order = simpleCandidate(true);
  await run('basic', '只识别意图与约束', {}, {input: '查询订单000123，不要取消订单'}, order, r => assert.equal(r.fieldResults.length, 0));
  order.observations = [observation('orderId', '000123')];
  const native = await run('native', '字符串订单编号', {schema: orderSchema}, {input: '查询订单000123，不要取消订单', fields: ['orderId']}, order, r => assert.equal(r.effective.intents[0].inputs.orderId, '000123'));
  const conditional = structuredClone(order); conditional.kind = 'amendment'; conditional.usedHistory = true;
  conditional.nodes[0].priorRef = {root: 'baseline', pointer: '/intents/0'};
  conditional.constraints[0].priorRef = {root: 'baseline', pointer: '/intents/0/constraints/0'};
  conditional.constraints.push(constraint('failed', 'order', 'precondition', '只有检查失败才撤回查询，当前尚未检查'));
  conditional.observations = [];
  conditional.changes = [change('failed', 'add', 'constraint'), {...change('order', 'withdraw'), effect: 'conditional', conditionKey: 'failed'}];
  await run('conditional', '条件未成立不提前撤回', {schema: orderSchema}, {input: '如果检查失败才撤回查询，尚未检查，其他不变', baseline: native.effective}, conditional, r => {assert.equal(r.effective.intents.length, 1); assert(r.turn.changes.some(c => c.effect === 'conditional'));});
  const two = draft([node('one', '查询', '订单000123'), node('two', '查询', '订单000456')]);
  two.observations = [observation('orderId', '000123', 'one'), observation('orderId', '000456', 'two')];
  await run('two-orders', '多个订单各有归属', {schema: orderSchema}, {input: '查询订单000123和000456', fields: ['orderId']}, two, r => assert.deepEqual(r.effective.intents.map(n => n.inputs.orderId), ['000123', '000456']));

  const tree = draft([node('module', '实现', '用户模块'), node('login', '实现', '登录', 'module'), node('register', '实现', '注册', 'module')]);
  tree.nodes[0].expectedOutput = ['中文使用说明'];
  tree.constraints = [constraint('no-db', 'module', 'prohibition', '不要修改数据库'), constraint('email', 'login', 'requirement', '登录需要邮箱验证码'), constraint('approved', 'login', 'precondition', '审核通过后才启用登录'), constraint('prefer', 'login', 'preference', '优先沿用现有样式')];
  tree.relations = [{key: 'parallel', priorRef: null, fromKey: 'login', toKey: 'register', kind: 'parallel', condition: null, sources: [src]}];
  tree.changes.push(...tree.constraints.map(c => change(c.key, 'add', 'constraint')), change('parallel', 'add', 'relation'));
  const firstTree = await run('requirements', '父子需求与四类约束', {}, {input: '请实现用户模块，包含可并行开发的登录和注册。登录需要邮箱验证码，审核通过后才启用；优先沿用现有样式。整个模块不要修改数据库，交付中文使用说明。'}, tree, r => assert.equal(r.effective.intents[0].children.length, 2));
  const amended = structuredClone(tree);
  amended.kind = 'amendment'; amended.usedHistory = true; amended.relatedKeys = ['module', 'login'];
  amended.nodes = amended.nodes.slice(0, 2); amended.nodes[0].priorRef = {root: 'baseline', pointer: '/intents/0'}; amended.nodes[1].priorRef = {root: 'baseline', pointer: '/intents/0/children/0'};
  amended.nodes[0].expectedOutput = ['英文使用说明'];
  amended.constraints.forEach((c, i) => {c.priorRef = {root: 'baseline', pointer: i === 0 ? '/intents/0/constraints/0' : '/intents/0/children/0/constraints/' + (i - 1)};});
  amended.relations = []; amended.priorTargets = [{kind: 'intent', key: 'register', priorRef: {root: 'baseline', pointer: '/intents/0/children/1'}}, {kind: 'relation', key: 'parallel', priorRef: {root: 'baseline', pointer: '/relations/0'}}];
  amended.changes = [change('module', 'modify'), change('register', 'withdraw'), change('parallel', 'withdraw', 'relation')];
  amended.changes[0].deltaHints = [{operation: 'set', path: '/expectedOutput'}];
  await run('withdraw', '撤回子项并修改交付语言', {}, {input: '撤回注册和对应并行关系，登录保留，说明文档改英文，其他不变', baseline: firstTree.effective}, amended, r => {assert.equal(r.effective.intents[0].children.length, 1); assert.equal(r.effective.intents[0].id, firstTree.effective.intents[0].id);});

  let vip;
  for (const [slug, input, fields, values] of [
    ['vip', '为订单000123设置VIP=true，优惠15', 'all', {orderId: '000123', isVip: true, discount: 15}],
    ['vip-changed', '这个订单改为非VIP，其他不变', ['isVip'], {isVip: false}],
    ['vip-fixed', '优惠改为5', ['discount'], {discount: 5}],
  ]) {
    const d = draft([node('order', '设置', '订单000123的VIP和优惠')]);
    if (vip) {d.kind = 'amendment'; d.usedHistory = true; d.nodes[0].priorRef = {root: 'baseline', pointer: '/intents/0'}; d.changes = [change('order', 'modify')];}
    d.observations = Object.entries(values).map(([field, value]) => observation(field, value));
    const request = {input, fields, ...(vip ? {baseline: vip.effective} : {}), ...(slug === 'vip-fixed' ? {context: {previousIssues: vip.issues}} : {})};
    vip = await run(slug, 'VIP优惠：' + input, {schema: vipSchema}, request, d, r => {
      if (slug === 'vip-changed') {assert(!Object.hasOwn(r.effective.intents[0].inputs, 'discount')); assert(r.fieldResults.some(f => f.status === 'invalidated'));}
      if (slug === 'vip-fixed') {assert.equal(r.effective.intents[0].inputs.discount, 5); assert(!r.issues.some(q => q.field === 'discount'));}
    });
  }
  const removed = draft([node('order', '设置', '订单000123的VIP和优惠')]); removed.kind = 'amendment'; removed.usedHistory = true; removed.nodes[0].priorRef = {root: 'baseline', pointer: '/intents/0'}; removed.changes = [change('order', 'modify')];
  removed.observations = [{...observation('discount', null, 'order', 'inputs', 'unknown'), withdrawn: true, sources: [src]}];
  await run('removed', '撤回字段要求', {schema: vipSchema}, {input: '撤回优惠参数要求，VIP和编号保持不变', fields: ['discount'], baseline: vip.effective}, removed, r => assert(r.fieldResults.some(f => f.status === 'removed')));
  const facts = draft([]); facts.kind = 'statement'; facts.observations = [observation('orderId', '000123', null, 'facts')];
  const factResult = await run('facts', '没有操作的事实', {schema: orderSchema}, {input: '订单编号是000123。', fields: ['orderId']}, facts, r => {assert.equal(r.effective.intents.length, 0); assert.equal(r.turn.facts.orderId, '000123');});
  const fromFact = structuredClone(order); fromFact.usedHistory = true; fromFact.observations[0].sources = [{root: 'context', pointer: '/previousFacts/orderId'}];
  await run('fact-query', '显式续传事实再查询', {schema: orderSchema}, {input: '查询这个订单，不要取消订单', fields: ['orderId'], context: {previousFacts: factResult.turn.facts}}, fromFact);

  const unclear = draft([node('proposal', '采用', '第三个方案')]); unclear.nodes[0].understanding = 'ambiguous';
  unclear.constraints = [constraint('no-code', null, 'prohibition', '先不修改代码')]; unclear.changes.push(change('no-code', 'add', 'constraint'));
  unclear.references = [{key: 'proposal-ref', ownerKey: 'proposal', priorRef: null, kind: 'entity', intentKey: null, entityRef: null, resolved: false, description: '未提供列表中的第三个方案', sources: [src]}];
  unclear.issues = [{key: 'proposal', ownerKey: 'proposal', fieldTarget: null, code: 'AMBIGUOUS_REFERENCE', category: 'ambiguity', message: '未提供方案列表，不能确定第三个方案。', sources: [src], candidates: [], questions: [{question: '请提供第三个方案的内容。', optionKeys: []}]}];
  const pending = await run('ambiguity', '对象不明时澄清', {}, {input: '采用第三个方案，但方案列表未提供；先不修改代码'}, unclear, r => assert.equal(r.status, 'partial'));
  const answer = draft([node('proposal', '采用', '邮箱验证码方案')]); answer.kind = 'answer'; answer.usedHistory = true; answer.nodes[0].priorRef = {root: 'baseline', pointer: '/intents/0'}; answer.changes = [change('proposal', 'modify')];
  answer.constraints = structuredClone(unclear.constraints); answer.constraints[0].priorRef = {root: 'baseline', pointer: '/constraints/0'};
  await run('answer', '回答澄清仍保留禁止事项', {}, {input: '第三个方案就是邮箱验证码方案，采用它，仍不修改代码', baseline: pending.effective, context: {previousIssues: pending.issues}}, answer, r => {assert.equal(r.issues.length, 0); assert.equal(r.effective.constraints[0].kind, 'prohibition');});

  const choices = draft([node('login', '实现', '登录')]); choices.nodes[0].understanding = 'ambiguous'; choices.constraints = [constraint('no-code', null, 'prohibition', '先不修改代码')]; choices.changes.push(change('no-code', 'add', 'constraint'));
  choices.issues = [{key: 'method', ownerKey: 'login', fieldTarget: null, code: 'AMBIGUOUS_REFERENCE', category: 'ambiguity', message: '登录方式有两个未确认选项。', sources: [src], candidates: [{key: 'sms', description: '短信验证码', intentKey: null, sources: [src]}, {key: 'email', description: '邮箱验证码', intentKey: null, sources: [src]}], questions: [{question: '选择哪种登录方式？', optionKeys: ['sms', 'email']}]}];
  const choiceResult = await run('candidates', '调用方材料中的多个候选', {}, {input: '实现登录，短信验证码或邮箱验证码，方式还没确定；先不修改代码'}, choices, r => assert.equal(r.issues[0].candidates.length, 2));
  const chosen = draft([node('login', '实现', '邮箱验证码登录')]); chosen.kind = 'answer'; chosen.usedHistory = true; chosen.nodes[0].priorRef = {root: 'baseline', pointer: '/intents/0'}; chosen.constraints = structuredClone(choices.constraints); chosen.constraints[0].priorRef = {root: 'baseline', pointer: '/constraints/0'}; chosen.changes = [change('login', 'modify')];
  await run('chosen', '第二个选项必须有对应材料', {}, {input: '选第二个，其他要求不变', baseline: choiceResult.effective, context: {previousIssues: choiceResult.issues}}, chosen, r => {assert.equal(r.issues.length, 0); assert.equal(r.effective.constraints[0].text, locale === 'en' ? english('先不修改代码') : '先不修改代码');});
  const inferred = draft([node('service', '分析', '所指服务')]); inferred.nodes[0].target = null; inferred.nodes[0].understanding = 'ambiguous';
  inferred.inferences = [{target: {kind: 'intent', key: 'service', path: '/target'}, candidateJson: '"订单服务"', explanation: '用户表示可能是订单服务，但尚未确认。', sources: [src]}];
  await run('inference', '推断不当作已确认事实', {}, {input: '分析这个服务，可能是订单服务，但我还没确认', output: {evidence: false}}, inferred, r => {assert.equal(r.inferences.length, 1); assert.equal(r.effective.intents[0].target, null); assert(!('evidence' in r));});

  const schema = {type: 'object', required: ['orderId'], properties: {orderId: {type: 'string'}, amount: {type: 'number', minimum: 0}, note: {type: ['string', 'null']}, address: {type: 'string'}, pickup: {type: 'string'}}};
  const fields = draft([node('order', '设置', '订单参数')]); fields.observations = [observation('orderId', null, 'order', 'inputs', 'not_provided'), observation('amount', -5), observation('note', null), observation('address', null, 'order', 'inputs', 'unknown'), observation('pickup', null, 'order', 'inputs', 'not_applicable')];
  await run('field-states', '完整意图也可能有字段问题', {schema}, {input: '设置订单参数：金额-5，备注明确为null；编号没提供，地址还不确定，本次不涉及自提信息', fields: 'all'}, fields, r => {assert.equal(r.status, 'complete'); assert(r.fieldResults.some(f => f.status === 'explicit_null')); assert(r.fieldResults.some(f => f.status === 'invalid'));});
  const options = draft([node('report', '生成', '内部报告')]); options.observations = [observation('audience', 'internal', 'report', 'extensions')];
  options.evidence = [{target: {kind: 'intent', key: 'report', path: '/goal'}, sources: [src]}];
  options.suggestions = [{kind: 'clarification', text: '如需限定篇幅，可补充期望长度。', relatesTo: ['report']}];
  await run('output-options', '扩展标签与输出开关', {extensionSchema: {type: 'object', properties: {audience: {type: 'string', enum: ['internal', 'external']}}}}, {input: '生成内部报告', output: {extensions: true, suggestions: true, evidence: true}}, options, r => {assert.equal(r.effective.intents[0].extensions.audience, 'internal'); assert(r.evidence.length); assert(r.suggestions.length);});
  return readableIds(cases);
}
