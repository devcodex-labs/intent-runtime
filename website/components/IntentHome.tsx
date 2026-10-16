import {useRef, useState} from 'react';
import {withBase} from '@rspress/core/runtime';
import type {IntentResult, StructuredIntent} from '../../src/contracts/public';
import bundle from '../content/public/examples/scenarios.json';
import {version} from '../site';

type Example = {slug: string; title: string; config: object; request: {input: string}; result: IntentResult};
const examples = new Map((bundle.cases as unknown as Example[]).map(item => [item.slug, item]));
const scenes = [
  {label: '目标与限制', steps: ['native'], note: '保留用户要做的事，也保留明确的禁止事项。'},
  {label: '层级与要求', steps: ['requirements'], note: '父子目标只保留一份；正向要求、偏好与限制各有作用范围。'},
  {label: '修改与失效', steps: ['vip', 'vip-changed', 'vip-fixed'], note: '只改变一个条件，也可能让旧参数失效。应用明确传入前轮材料。'},
  {label: '不确定与澄清', steps: ['ambiguity'], note: '没有提供的内容保持未知，留下可以回答的问题。'},
];
const kinds = {requirement: '要求', prohibition: '禁止', precondition: '前提', preference: '偏好'};
const statuses: Record<string, string> = {present: '已验证', explicit_null: '明确为空', not_provided: '未提供', unknown: '待确定', not_applicable: '不适用', invalid: '无效', invalidated: '旧值失效', removed: '已撤回'};

function IntentNodes({nodes}: {nodes: StructuredIntent[]}) {
  return <ul className="ir-nodes">{nodes.map(node => <li key={node.id}>
    <div className="ir-node-title"><span className="ir-node-dot" aria-hidden="true" /><strong>{node.goal}</strong><code>{node.id}</code></div>
    {node.constraints.length > 0 && <ul className="ir-constraints">{node.constraints.map(c => <li key={c.id} data-kind={c.kind}><span>{kinds[c.kind]}</span>{c.text}</li>)}</ul>}
    {Object.keys(node.inputs).length > 0 && <dl className="ir-values">{Object.entries(node.inputs).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{JSON.stringify(value)}</dd></div>)}</dl>}
    {node.expectedOutput && <p className="ir-deliverable">交付 · {node.expectedOutput.join('、')}</p>}
    {node.children.length > 0 && <IntentNodes nodes={node.children} />}
  </li>)}</ul>;
}

function MarkedInput({text}: {text: string}) {
  return <>{text.split(/(000123|不要取消订单|不要修改数据库|先不修改代码|VIP=true|非VIP|优惠15|优惠改为5|登录需要邮箱验证码)/g).map((part, i) =>
    /^(000123|VIP=true|非VIP|优惠15|优惠改为5)$/.test(part) ? <mark className="ir-mark-value" key={i}>{part}</mark>
    : /^(不要|先不)/.test(part) ? <mark className="ir-mark-limit" key={i}>{part}</mark>
    : part === '登录需要邮箱验证码' ? <mark className="ir-mark-requirement" key={i}>{part}</mark> : <span key={i}>{part}</span>)}</>;
}

export default function IntentHome() {
  const [sceneIndex, setScene] = useState(0), [step, setStep] = useState(0), [copyState, setCopyState] = useState('');
  const [codeLanguage, setCodeLanguage] = useState<'js' | 'ts'>('js');
  const [installState, setInstallState] = useState('');
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const scene = scenes[sceneIndex], example = examples.get(scene.steps[step])!, result = example.result;
  const choose = (index: number) => {setScene(index); setStep(0); setCopyState('');};
  const needsValues = result.fieldResults.some(f => !['present', 'explicit_null'].includes(f.status));
  async function copy() {
    try {await navigator.clipboard.writeText(JSON.stringify(example, null, 2)); setCopyState('已复制完整输入与结果');}
    catch {setCopyState('复制不可用，请展开 JSON 选取或下载');}
  }
  return <main className="ir-home">
    <section className="ir-intro" aria-labelledby="ir-title">
      <div className="ir-intro-copy">
        <p className="ir-eyebrow"><span aria-hidden="true">↳</span> INTENT RUNTIME · {version}</p>
        <h1 id="ir-title">读懂请求里的<br /><span>目标、约束<br />与每一次改变。</span></h1>
        <p className="ir-lead">为 Node.js 应用与 MCP 客户端提供结构化理解。保留“要做什么”，也保留“不要做什么”；条件改变时，让旧参数明确失效。</p>
        <div className="ir-actions"><a className="ir-button ir-button-primary" href={withBase('/guide/quick-start')}>开始接入 <span aria-hidden="true">↗</span></a><a className="ir-text-link" href={withBase('/guide/results')}>如何读取结果 →</a></div>
        <div className="ir-install"><code>npm install @devcodex/intent-runtime</code><button type="button" aria-label="复制安装命令" onClick={() => {void navigator.clipboard.writeText('npm install @devcodex/intent-runtime').then(() => setInstallState('安装命令已复制'), () => setInstallState('请选取安装命令复制'));}}>复制</button></div>
        <span className="ir-install-state" role="status">{installState}</span>
        <p className="ir-stack">Node.js ≥20 · JavaScript / TypeScript · MCP</p>
      </div>
    </section>

    <section className="ir-workbench" aria-label="固定意图结构化演示">
      <div className="ir-workbench-top"><span><span className="ir-signal" aria-hidden="true" /> 从一句话，看见理解</span><span>固定示例 · 不调用模型</span></div>
      <div className="ir-tabs" role="tablist" aria-label="选择演示场景">{scenes.map((item, index) => <button key={item.label} ref={el => {tabs.current[index] = el;}} type="button" role="tab" id={'ir-tab-' + index} aria-selected={sceneIndex === index} aria-controls="ir-scene-panel" tabIndex={sceneIndex === index ? 0 : -1} onClick={() => choose(index)} onKeyDown={event => {
        let next: number | undefined;
        if (event.key === 'ArrowRight') next = (index + 1) % scenes.length;
        if (event.key === 'ArrowLeft') next = (index + scenes.length - 1) % scenes.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = scenes.length - 1;
        if (next !== undefined) {event.preventDefault(); choose(next); tabs.current[next]?.focus();}
      }}><span>0{index + 1}</span>{item.label}</button>)}</div>
      <div id="ir-scene-panel" role="tabpanel" aria-labelledby={'ir-tab-' + sceneIndex} className="ir-scene" tabIndex={0}>
        <div className="ir-source">
          <p className="ir-section-label">01 / 用户所说</p>
          {scene.steps.length > 1 && <div className="ir-steps" aria-label="选择对话轮次">{scene.steps.map((slug, index) => <button type="button" key={slug} aria-pressed={index === step} onClick={() => {setStep(index); setCopyState('');}}>第 {index + 1} 轮</button>)}</div>}
          <blockquote><MarkedInput text={example.request.input} /></blockquote>
          <p className="ir-scene-note">{scene.note}</p>
          <div className="ir-legend"><span><i className="ir-legend-value" />参数与条件</span><span><i className="ir-legend-limit" />禁止事项</span><span><i className="ir-legend-requirement" />正向要求</span></div>
          <details className="ir-materials" key={'materials-' + example.slug}><summary>查看本例的输入配置</summary><p>调用方提供这些材料；固定示例不在浏览器调用模型。{sceneIndex === 2 && 'VIP优惠上限20，非VIP上限10；这是本例 Schema 声明的规则。'}</p><pre tabIndex={0}><code>{JSON.stringify({config: example.config, request: example.request}, null, 2)}</code></pre></details>
        </div>
        <div className="ir-result">
          <div className="ir-result-title"><p className="ir-section-label">02 / 结构化理解 · 摘要</p><span className="ir-status" data-status={result.status}>{result.status === 'complete' ? '理解完整' : '仍需澄清'}</span></div>
          <IntentNodes nodes={result.effective.intents} />
          {result.effective.constraints.length > 0 && <ul className="ir-constraints ir-global">{result.effective.constraints.map(c => <li key={c.id} data-kind={c.kind}><span>全局{kinds[c.kind]}</span>{c.text}</li>)}</ul>}
          {result.fieldResults.length > 0 && <div className="ir-field-checks"><span className="ir-section-label">fieldResults / 本轮字段</span>{result.fieldResults.map((field, index) => <div key={index} data-status={field.status}><code>{field.field}</code><span>{statuses[field.status]}</span></div>)}</div>}
          {result.issues.length > 0 && <div className="ir-issues"><span>{needsValues ? '参数需要补充' : '向用户澄清'}</span>{result.issues.map(issue => <div key={issue.id}><p>{issue.message}</p>{issue.questions?.map((q, index) => <p key={index}>{q.question}</p>)}</div>)}</div>}
          <p className="ir-result-foot">{needsValues ? '理解完整，不代表所有参数有效。' : '完整意图只保留在 effective；摘要不替代完整响应。'}</p>
        </div>
      </div>
      <div className="ir-workbench-bottom"><details key={example.slug}><summary>查看完整 JSON</summary><pre tabIndex={0}><code>{JSON.stringify(example, null, 2)}</code></pre></details><div className="ir-export"><button type="button" onClick={() => {void copy();}}>复制完整示例</button><a href={withBase('/examples/' + example.slug + '-example.json')} download target="_blank" rel="noopener noreferrer">下载 JSON <span aria-hidden="true">↓</span></a></div><span className="ir-copy-state" role="status">{copyState}</span></div>
    </section>

    <section className="ir-start" aria-labelledby="ir-start-title">
      <div><p className="ir-eyebrow">从一次调用开始</p><h2 id="ir-start-title">把理解交给它，<br />把下一步留给你的应用。</h2><p>接入你的模型，调用 parse，再读取目标与约束。需要业务参数时，再添加 Schema。</p><a className="ir-text-link" href={withBase('/guide/quick-start')}>完整安装与运行步骤 →</a></div>
      <div className="ir-code-card"><div className="ir-code-tabs" role="group" aria-label="示例语言">{(['js', 'ts'] as const).map(language => <button type="button" key={language} aria-pressed={codeLanguage === language} onClick={() => setCodeLanguage(language)}>{language === 'js' ? 'JavaScript' : 'TypeScript'}</button>)}</div><pre tabIndex={0}><code>{`import {Intent${codeLanguage === 'ts' ? ', type IntentParseRequest' : ''}} from '@devcodex/intent-runtime';
import {createApiExecutor} from '@devcodex/intent-runtime/adapters/api';

const intent = new Intent({executor: createApiExecutor({
  provider: 'openai',
  apiKey: process.env.INTENT_API_KEY${codeLanguage === 'ts' ? '!' : ''},
  model: process.env.INTENT_MODEL${codeLanguage === 'ts' ? '!' : ''},
})});
const request${codeLanguage === 'ts' ? ': IntentParseRequest' : ''} = {input: '查询订单000123，不取消订单'};
try {
  const result = await intent.parse(request);
  console.log(result.effective);
} finally {await intent.dispose();}`}</code></pre><p>先设置模型名称和 API Key；TS 使用 ESM 编译环境。模型与网关也可自定义。</p></div>
    </section>

    <section className="ir-entries" aria-labelledby="ir-entry-title"><div><p className="ir-eyebrow">沿用你的工作方式</p><h2 id="ir-entry-title">接到你已有的应用里。</h2><p>应用调用、当前宿主模型、独立服务或已有 MCP Server，选择与你的工程对应的一条路径。</p></div><ol>{[
      ['Node.js 应用', 'JavaScript / TypeScript，连接模型与自有网关。', '/guide/quick-start'],
      ['Codex 当前模型', '保存配置并登记，无需额外模型 API Key。', '/integrations/codex'],
      ['独立 MCP 服务', '通过 stdio 或 HTTP 连接，按需指定端口。', '/integrations/mcp'],
      ['已有 MCP Server', '在原有服务中增加工具，保留原有连接。', '/integrations/mcp-sdk'],
    ].map(([title, description, url], index) => <li key={url}><a href={withBase(url)}><span className="ir-entry-number">0{index + 1}</span><div><h3>{title}</h3><p>{description}</p></div><span aria-hidden="true">↗</span></a></li>)}</ol></section>

    <section className="ir-handoff"><span className="ir-section-label">从理解到使用</span><h2>理解之后，由你的应用接手。</h2><p>Intent Runtime 只理解你提供的材料。消息与历史由你提供，工具、授权和业务执行由应用管理。</p><div><a href={withBase('/guide/results')}>如何消费结果 →</a><a href={withBase('/guide/multi-turn')}>接续下一轮 →</a><a href={withBase('/api/errors')}>处理问题与失败 →</a></div></section>
    <footer className="ir-footer">{version} 文档 · MIT License · devcodex-labs</footer>
  </main>;
}
