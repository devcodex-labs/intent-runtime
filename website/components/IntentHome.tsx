import {Children, type ReactNode, useRef, useState} from 'react';
import {useLang, withBase} from '@rspress/core/runtime';
import {CodeBlockRuntime} from '@rspress/core/theme-original';
import type {IntentResult, StructuredIntent} from '../../src/contracts/public';
import bundle from '../content/public/examples/scenarios.json';
import {version} from '../site';
import englishBundle from '../content/public/examples/en/scenarios.json';
import {useHomeText} from './home-copy';

type Example = {slug: string; title: string; config: object; request: {input: string}; result: IntentResult};
const exampleSets = {zh: bundle, en: englishBundle};
const scenes = [
  {label: '目标与限制', steps: ['native'], note: '保留用户要做的事，也保留明确的禁止事项。'},
  {label: '层级与要求', steps: ['requirements'], note: '父子目标只保留一份；正向要求、偏好与限制各有作用范围。'},
  {label: '修改与失效', steps: ['vip', 'vip-changed', 'vip-fixed'], note: '只改变一个条件，也可能让旧参数失效。应用明确传入前轮材料。'},
  {label: '不确定与澄清', steps: ['ambiguity'], note: '没有提供的内容保持未知，留下可以回答的问题。'},
];
const kinds = {requirement: '要求', prohibition: '禁止', precondition: '前提', preference: '偏好'};
const statuses: Record<string, string> = {present: '已验证', explicit_null: '明确为空', not_provided: '未提供', unknown: '待确定', not_applicable: '不适用', invalid: '无效', invalidated: '旧值失效', removed: '已撤回'};

function IntentNodes({nodes}: {nodes: StructuredIntent[]}) {
  const t = useHomeText(), en = useLang() !== 'zh';
  return <ul className="ir-nodes">{nodes.map(node => <li key={node.id}>
    <div className="ir-node-title"><span className="ir-node-dot" aria-hidden="true" /><strong>{node.goal}</strong><code>{node.id}</code></div>
    {node.constraints.length > 0 && <ul className="ir-constraints">{node.constraints.map(c => <li key={c.id} data-kind={c.kind}><span>{t(kinds[c.kind])}</span>{c.text}</li>)}</ul>}
    {Object.keys(node.inputs).length > 0 && <dl className="ir-values">{Object.entries(node.inputs).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{JSON.stringify(value)}</dd></div>)}</dl>}
    {node.expectedOutput && <p className="ir-deliverable">{t('交付')} · {node.expectedOutput.join(en ? ', ' : '、')}</p>}
    {node.children.length > 0 && <IntentNodes nodes={node.children} />}
  </li>)}</ul>;
}

function MarkedInput({text}: {text: string}) {
  return <>{text.split(/(000123|Do not cancel the order|Do not modify the database|Do not modify code yet|non-VIP|discount=15|Change the discount to 5|Sign-in requires an email verification code|不要取消订单|不要修改数据库|先不修改代码|VIP=true|非VIP|优惠15|优惠改为5|登录需要邮箱验证码)/g).map((part, i) =>
    /^(000123|non-VIP|discount=15|Change the discount to 5|VIP=true|非VIP|优惠15|优惠改为5)$/.test(part) ? <mark className="ir-mark-value" key={i}>{part}</mark>
    : /^(Do not|不要|先不)/.test(part) ? <mark className="ir-mark-limit" key={i}>{part}</mark>
    : (part === '登录需要邮箱验证码' || part === 'Sign-in requires an email verification code') ? <mark className="ir-mark-requirement" key={i}>{part}</mark> : <span key={i}>{part}</span>)}</>;
}

export function HomeCode({children}: {children: ReactNode}) {
  const t = useHomeText();
  const [language, setLanguage] = useState(0);
  const [copied, setCopied] = useState('');
  const root = useRef<HTMLDivElement>(null);
  return <div ref={root} className="ir-code-card">
    <div className="ir-code-tabs" role="group" aria-label={t('示例语言')}>{['JavaScript', 'TypeScript'].map((label, index) => <button type="button" key={label} aria-pressed={index === language} onClick={() => {setLanguage(index); setCopied('');}}>{label}</button>)}<span>{language === 0 ? 'intent.js' : 'intent.ts'}</span><button type="button" aria-label={t('复制当前代码')} onClick={() => {
      const code = root.current?.querySelector('.ir-code-snippet:not([hidden]) code')?.textContent;
      if (code) void navigator.clipboard.writeText(code).then(() => setCopied(t('代码已复制')), () => setCopied(t('请选取代码复制')));
    }}>{t('复制')}</button></div>
    {Children.toArray(children).map((child, index) => <div className="ir-code-snippet" hidden={index !== language} key={index}>{child}</div>)}
    <p>{t('先设置模型名称和 API Key。JS 项目设置 type: module，TS 按 ESM 编译；模型与网关均可自定义。')}</p>
    <span className="ir-code-copy-state" role="status">{copied}</span>
  </div>;
}

export default function IntentHome({children}: {children: ReactNode}) {
  const t = useHomeText(), en = useLang() !== 'zh';
  const href = (path: string) => withBase((en ? '' : '/zh') + path);
  const examples = new Map((exampleSets[en ? 'en' : 'zh'].cases as unknown as Example[]).map(item => [item.slug, item]));
  const [sceneIndex, setScene] = useState(0), [step, setStep] = useState(0), [copyState, setCopyState] = useState('');
  const [installState, setInstallState] = useState('');
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const scene = scenes[sceneIndex], example = examples.get(scene.steps[step])!, result = example.result;
  const choose = (index: number) => {setScene(index); setStep(0); setCopyState('');};
  const needsValues = result.fieldResults.some(f => !['present', 'explicit_null'].includes(f.status));
  async function copy() {
    try {await navigator.clipboard.writeText(JSON.stringify(example, null, 2)); setCopyState(t('已复制完整输入与结果'));}
    catch {setCopyState(t('复制不可用，请展开 JSON 选取或下载'));}
  }
  return <main className="ir-home">
    <section className="ir-intro" aria-labelledby="ir-title">
      <div className="ir-intro-copy">
        <p className="ir-eyebrow"><span aria-hidden="true">↳</span> INTENT RUNTIME · {version}</p>
        <h1 id="ir-title">{en ? <>Turn requests into<br /><span>structured intent.</span></> : <>把用户请求，变成<br /><span>可验证的意图结构。</span></>}</h1>
        <p className="ir-lead">{t('提取目标、保留约束、追踪变化。在 Node.js 或 MCP 中，使用你自己的模型。')}</p>
        <div className="ir-actions"><a className="ir-button ir-button-primary" href={href('/guide/quick-start')}>{t("开始接入")}<span aria-hidden="true">↗</span></a><a className="ir-button" href={href('/examples/index')}>{t('探索示例')}<span aria-hidden="true">→</span></a></div>
        <div className="ir-install"><code>npm install @devcodex/intent-runtime</code><button type="button" aria-label={t('复制安装命令')} onClick={() => {void navigator.clipboard.writeText('npm install @devcodex/intent-runtime').then(() => setInstallState(t('安装命令已复制')), () => setInstallState(t('请选取安装命令复制')));}}>{t("复制")}</button></div>
        <span className="ir-install-state" role="status">{installState}</span>
        <p className="ir-stack">Node.js ≥20 · JavaScript / TypeScript · MCP</p>
      </div>
    </section>

    <section className="ir-workbench" aria-label={t('固定意图结构化演示')}>
      <div className="ir-workbench-top"><span><span className="ir-signal" aria-hidden="true" />{t("从一句话，看见理解")}</span><span>{t("固定示例 · 不调用模型")}</span></div>
      <div className="ir-tabs" role="tablist" aria-label={t('选择演示场景')}>{scenes.map((item, index) => <button key={t(item.label)} ref={el => {tabs.current[index] = el;}} type="button" role="tab" id={'ir-tab-' + index} aria-selected={sceneIndex === index} aria-controls="ir-scene-panel" tabIndex={sceneIndex === index ? 0 : -1} onClick={() => choose(index)} onKeyDown={event => {
        let next: number | undefined;
        if (event.key === 'ArrowRight') next = (index + 1) % scenes.length;
        if (event.key === 'ArrowLeft') next = (index + scenes.length - 1) % scenes.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = scenes.length - 1;
        if (next !== undefined) {event.preventDefault(); choose(next); tabs.current[next]?.focus();}
      }}><span>0{index + 1}</span>{t(item.label)}</button>)}</div>
      <div id="ir-scene-panel" role="tabpanel" aria-labelledby={'ir-tab-' + sceneIndex} className="ir-scene" tabIndex={0}>
        <div className="ir-source">
          <p className="ir-section-label">{t("01 / 用户所说")}</p>
          {scene.steps.length > 1 && <div className="ir-steps" aria-label={t('选择对话轮次')}>{scene.steps.map((slug, index) => <button type="button" key={slug} aria-pressed={index === step} onClick={() => {setStep(index); setCopyState('');}}>{en ? 'Turn ' : '第 '}{index + 1}{en ? '' : ' 轮'}</button>)}</div>}
          <blockquote><MarkedInput text={example.request.input} /></blockquote>
          <p className="ir-scene-note">{t(scene.note)}</p>
          {result.fieldResults.length > 0 && <p className="ir-schema-note">{sceneIndex === 0 ? t('本例已配置订单号 Schema，并通过 fields 选择 orderId。') : t('本例按调用方的 Schema 规则校验所选字段。')}</p>}
          <div className="ir-legend"><span><i className="ir-legend-value" />{t("参数与条件")}</span><span><i className="ir-legend-limit" />{t("禁止事项")}</span><span><i className="ir-legend-requirement" />{t("正向要求")}</span></div>
          <details className="ir-materials" key={'materials-' + example.slug}><summary>{t("查看本例的输入配置")}</summary><p>{t('调用方提供这些材料；固定示例不在浏览器调用模型。')}{sceneIndex === 2 && t('VIP优惠上限20，非VIP上限10；这是本例 Schema 声明的规则。')}</p><CodeBlockRuntime key={example.slug} lang="json" code={JSON.stringify({config: example.config, request: example.request}, null, 2)} /></details>
        </div>
        <div className="ir-result">
          <div className="ir-result-title"><p className="ir-section-label">{t("02 / 结构化理解 · 摘要")}</p><span className="ir-status" data-status={result.status}>{result.status === 'complete' ? t('理解完整') : t('仍需澄清')}</span></div>
          <IntentNodes nodes={result.effective.intents} />
          {result.effective.constraints.length > 0 && <ul className="ir-constraints ir-global">{result.effective.constraints.map(c => <li key={c.id} data-kind={c.kind}><span>{t('全局')}{t(kinds[c.kind])}</span>{c.text}</li>)}</ul>}
          {result.fieldResults.length > 0 && <div className="ir-field-checks"><span className="ir-section-label">{t("fieldResults / 本轮字段")}</span>{result.fieldResults.map((field, index) => <div key={index} data-status={field.status}><code>{field.field}</code><span>{t(statuses[field.status])}</span></div>)}</div>}
          {result.issues.length > 0 && <div className="ir-issues"><span>{needsValues ? t('参数需要补充') : t('向用户澄清')}</span>{result.issues.map(issue => <div key={issue.id}><p>{issue.message}</p>{issue.questions?.map((q, index) => <p key={index}>{q.question}</p>)}</div>)}</div>}
          <p className="ir-result-foot">{needsValues ? t('理解完整，不代表所有参数有效。') : t('完整意图只保留在 effective；摘要不替代完整响应。')}</p>
        </div>
      </div>
      <div className="ir-workbench-bottom"><details key={example.slug}><summary>{t("查看完整 JSON")}</summary><CodeBlockRuntime key={example.slug} lang="json" code={JSON.stringify(example, null, 2)} /></details><div className="ir-export"><button type="button" onClick={() => {void copy();}}>{t("复制完整示例")}</button><a href={withBase('/examples/' + (en ? 'en/' : '') + example.slug + '-example.json')} download target="_blank" rel="noopener noreferrer">{t("下载 JSON")}<span aria-hidden="true">↓</span></a></div><span className="ir-copy-state" role="status">{copyState}</span></div>
    </section>

    <section className="ir-start" aria-labelledby="ir-start-title">
      <div className="ir-section-heading"><p className="ir-eyebrow">{t("从一次调用开始")}</p><h2 id="ir-start-title">{t('一个模型，一次调用。')}</h2><p>{t("接入你的模型，调用 parse，再读取目标与约束。需要业务参数时，再添加 Schema。")}</p></div>
      <HomeCode>{children}</HomeCode>
      <a className="ir-text-link" href={href('/guide/quick-start')}>{t("完整安装与运行步骤 →")}</a>
    </section>

    <section className="ir-entries" aria-labelledby="ir-entry-title"><div className="ir-section-heading"><p className="ir-eyebrow">{t("沿用你的工作方式")}</p><h2 id="ir-entry-title">{t("接到你已有的应用里。")}</h2><p>{t("应用调用、当前宿主模型、独立服务或已有 MCP Server，选择与你的工程对应的一条路径。")}</p></div><ol>{[
      ['Node.js 应用', 'JavaScript / TypeScript，连接模型与自有网关。', '/guide/quick-start'],
      ['Codex 当前模型', '保存配置并登记，无需额外模型 API Key。', '/integrations/codex'],
      ['独立 MCP 服务', '通过 stdio 或 HTTP 连接，按需指定端口。', '/integrations/mcp'],
      ['已有 MCP Server', '在原有服务中增加工具，保留原有连接。', '/integrations/mcp-sdk'],
    ].map(([title, description, url], index) => <li key={url}><a href={href(url)}><span className="ir-entry-number">0{index + 1}</span><div><h3>{t(title)}</h3><p>{t(description)}</p></div><span aria-hidden="true">↗</span></a></li>)}</ol></section>

    <section className="ir-handoff"><p>{t("Intent Runtime 只理解你提供的材料。消息与历史由你提供，工具、授权和业务执行由应用管理。")}</p><div><a href={href('/guide/results')}>{t("如何消费结果 →")}</a><a href={href('/guide/multi-turn')}>{t("接续下一轮 →")}</a><a href={href('/api/errors')}>{t("处理问题与失败 →")}</a></div></section>
    <footer className="ir-footer"><span>{version} · MIT License · devcodex-labs</span><nav aria-label={t('项目资源')}><a href="https://github.com/devcodex-labs/intent-runtime">GitHub</a><a href="https://www.npmjs.com/package/@devcodex/intent-runtime">npm</a><a href="https://github.com/devcodex-labs/intent-runtime/blob/main/CHANGELOG.md">Changelog</a><a href={href('/testing/validation')}>{t('兼容与支持')}</a></nav></footer>
  </main>;
}
