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
        <p className="ir-eyebrow"><span aria-hidden="true">//</span> INTENT RUNTIME</p>
        <h1 id="ir-title">一句请求，<br /><span>不止一个意思。</span></h1>
        <p className="ir-lead">将用户请求转成目标、约束和业务参数。保留“查询订单”的目标，也保留“不取消”的限制；理解之后，由你的应用决定下一步。</p>
        <div className="ir-actions"><a className="ir-button ir-button-primary" href={withBase('/guide/quick-start')}>快速开始 <span aria-hidden="true">↗</span></a><a className="ir-button" href={withBase('/guide/results')}>看懂结果 <span aria-hidden="true">→</span></a></div>
        <p className="ir-stack">Node.js ≥20 · TypeScript · 标准 MCP</p>
        <nav className="ir-paths" aria-label="选择接入方式"><a href={withBase('/guide/quick-start')}>Node.js 应用 →</a><a href={withBase('/integrations/codex')}>Codex →</a><a href={withBase('/integrations/mcp')}>MCP →</a></nav>
      </div>
      <div className="ir-annotation" aria-hidden="true"><span>原文</span><i /><span>意图</span><i /><span>结构</span><div>保留意义<br />清楚表达</div></div>
    </section>

    <section className="ir-entries" aria-labelledby="ir-entry-title"><div><p className="ir-eyebrow">从你的使用场景开始</p><h2 id="ir-entry-title">让理解，接入你的应用。</h2><p>先选调用方式，再选模型来源。所有入口共用同一识别核心。</p><a href={withBase('/guide/installation')}>查看当前版本与安装方式 →</a></div><ol>{[
      ['在 Node.js 项目中调用', '配置模型，调用 parse，读取结构化结果。', '/guide/quick-start'],
      ['在 Codex 中使用当前模型', '登记 MCP，由当前宿主完成识别交接。', '/integrations/codex'],
      ['给已有 MCP 添加工具', '保留你的 SDK、连接与原工具，合并识别能力。', '/integrations/mcp-sdk'],
      ['启动独立 MCP 服务', '提供可信配置，通过 stdio 暴露工具。', '/integrations/mcp#独立-stdio-服务'],
    ].map(([title, description, url], index) => <li key={url}><a href={withBase(url)}><span className="ir-entry-number">0{index + 1}</span><div><h3>{title}</h3><p>{description}</p></div><span aria-hidden="true">↗</span></a></li>)}</ol></section>

    <section className="ir-workbench" aria-label="固定意图结构化演示">
      <div className="ir-workbench-top"><span><span className="ir-signal" aria-hidden="true" /> 观察一次理解</span><span>固定示例 · 可查看完整材料</span></div>
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

    <section className="ir-handoff"><span className="ir-section-label">从理解到使用</span><h2>理解之后，由你的应用接手。</h2><p>Intent Runtime 只理解你提供的材料。消息与历史由你提供，工具、授权和业务执行由应用管理。</p><div><a href={withBase('/guide/results')}>如何消费结果 →</a><a href={withBase('/guide/multi-turn')}>接续下一轮 →</a><a href={withBase('/api/errors')}>处理问题与失败 →</a></div></section>
    <footer className="ir-footer">{version} 文档 · MIT License · devcodex-labs</footer>
  </main>;
}
