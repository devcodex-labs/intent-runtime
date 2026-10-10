import { useState } from "react";
import { href, repository, version } from "./site";

const command = "npm install -g @devcodex-labs/intent-runtime";

export function Home() {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      setCopyFailed(true);
    }
  }
  return <main className="ir-home">
    <section className="ir-hero" aria-labelledby="hero-title">
      <div className="ir-hero-grid">
        <div className="ir-hero-copy">
          <a className="ir-release" href={href("testing/validation.html")}><span />v{version} · 中文开发预览 <span aria-hidden="true">↗</span></a>
          <p className="ir-eyebrow">用户请求 → 结构化意图</p>
          <h1 id="hero-title">读懂当前请求。<br /><em>让意图有据可查。</em></h1>
          <p className="ir-lead">识别动作、对象与条件，保留明确的要求和禁止事项。通过 schema-dsl 提取业务字段，把自然语言交给应用可以处理的结构。</p>
          <div className="ir-actions">
            <a className="ir-button ir-button-primary" href={href("guide/quick-start.html")}>开始使用 <span aria-hidden="true">→</span></a>
            <a className="ir-button ir-button-secondary" href={href("integrations/codex-cli.html")}>接入 Codex</a>
          </div>
          <div className="ir-install">
            <span className="ir-prompt" aria-hidden="true">$</span><code>{command}</code>
            <button type="button" onClick={copy} aria-label="复制全局安装命令">{copied ? "已复制" : "复制"}</button>
          </div>
          <p className="ir-install-note" role="status">{copyFailed ? "请选中上方命令手动复制。" : "正式版本发布后，一行命令完成全局安装与已检测到的 Codex 客户端配置。"}</p>
          <div className="ir-facts"><span>Node.js ≥ 20.0.0</span><span>TypeScript / ESM</span><span>MIT</span></div>
        </div>
        <div className="ir-console" aria-label="结构化意图结果示例">
          <div className="ir-console-bar"><span className="ir-console-dots"><i /><i /><i /></span><span>intent.parse</span><span className="ir-console-tag">示例</span></div>
          <div className="ir-console-input"><span className="ir-code-label">当前请求</span><p>查询订单 <strong>000123</strong></p></div>
          <div className="ir-console-code"><span className="ir-code-label">结构化结果</span><pre><code>{`{
  "input": "查询订单 000123",
  "normalizedInput": "查询订单 000123",
  "primaryIntent": "查询订单",
  "requirements": [],
  "intents": [{
    "id": "intent-1",
    "action": "query",
    "target": "订单 000123",
    "status": "ready",
    "requirements": []
  }],
  "prohibitions": [],
  "data": { "orderId": "000123" }
}`}</code></pre></div>
          <div className="ir-console-footer"><span><i />识别结果保留原始 input</span><span>业务执行交由调用方</span></div>
        </div>
      </div>
    </section>
    <nav className="ir-paths" aria-label="文档入口">
      {[ ["01", "快速开始", "从安装到第一次识别", "guide/quick-start.html"], ["02", "模型集成", "Codex、OpenAI 与 xAI", "integrations/codex-cli.html"], ["03", "业务字段", "Schema、选择与来源", "guide/schema-fields.html"], ["04", "API 参考", "契约、错误与生命周期", "api/intent.html"] ].map(([n,t,d,u]) => <a key={n} href={href(u)}><span className="ir-path-number">{n}</span><div><strong>{t}</strong><span>{d}</span></div><b aria-hidden="true">↗</b></a>)}
    </nav>
    <section className="ir-section" aria-labelledby="capabilities-title">
      <div className="ir-section-head"><p className="ir-eyebrow">从语义到契约</p><h2 id="capabilities-title">保留请求的含义，<br />给应用明确的处理依据。</h2><p>模型负责理解，模块校验候选与字段来源。最终结果保留理解状态，应用据此继续自己的业务流程。</p></div>
      <div className="ir-capabilities">
        <article><span className="ir-card-mark">01 / 意图</span><h3>当前有效请求</h3><p>结合明确提供的上下文识别当前请求，表达多动作、撤回与条件，不把历史里已结束的动作当成新任务。</p><a href={href("guide/intent-contract.html")}>阅读意图契约 <span aria-hidden="true">→</span></a></article>
        <article><span className="ir-card-mark">02 / 数据</span><h3>可扩展的业务字段</h3><p>用 schema-dsl 声明字段及业务描述。按需选择扩展字段，保留精确值，对缺失、冲突和来源问题给出反馈。</p><a href={href("guide/schema-fields.html")}>定义业务 Schema <span aria-hidden="true">→</span></a></article>
        <article><span className="ir-card-mark">03 / 集成</span><h3>选择模型接入方式</h3><p>通过 MCP 与当前 Codex 模型协作，或显式配置 OpenAI、xAI API。两条路径使用同一套意图契约。</p><a href={href("integrations/openai-xai.html")}>查看集成方式 <span aria-hidden="true">→</span></a></article>
      </div>
    </section>
    <section className="ir-section ir-workflow" aria-labelledby="workflow-title">
      <div className="ir-section-head"><p className="ir-eyebrow">识别流程</p><h2 id="workflow-title">先理解意图，再提取业务字段。</h2><p>选择空字段数组时只返回默认意图结果。需要扩展字段时，在已验证的默认结果之后继续提取。</p></div>
      <ol className="ir-steps">
        <li><span>1</span><h3>提供原始材料</h3><p>当前 input、明确 context，以及所需 fields。</p><code>input / context / fields</code></li>
        <li><span>2</span><h3>生成并校验候选</h3><p>模型生成 core 候选；需要时继续 data 候选。</p><code>core → data</code></li>
        <li><span>3</span><h3>交付结果或错误</h3><p>应用收到完整结果，或带问题说明的错误与部分结果。</p><code>result / issues / partialResult</code></li>
      </ol>
    </section>
    <section className="ir-section ir-boundaries" aria-labelledby="boundaries-title">
      <div><p className="ir-eyebrow">明确使用边界</p><h2 id="boundaries-title">把理解、执行与验证<br />分别说清楚。</h2><p>ready 表示已理解的请求具备表达上的条件，业务权限与执行决定仍由应用处理。真实识别质量需要目标模型与客户端验收。</p><a href={href("testing/validation.html")}>查看验证方法 <span aria-hidden="true">→</span></a></div>
      <div className="ir-boundary-list"><article><h3>长期任务</h3><p>默认不按时间过期；仍需保持原进程与 MCP 连接。</p></article><article><h3>部分结果</h3><p>扩展提取失败时保留已经验证的默认字段。</p></article><article><h3>真实评测</h3><p>协议测试证明链路工作，准确率需要独立语义评审。</p></article></div>
    </section>
    <section className="ir-start"><div><p className="ir-eyebrow">准备开始</p><h2>从你的接入方式出发。</h2></div><div className="ir-actions"><a className="ir-button ir-button-primary" href={href("guide/quick-start.html")}>阅读快速开始 <span aria-hidden="true">→</span></a><a className="ir-button ir-button-secondary" href={repository}>GitHub <span aria-hidden="true">↗</span></a></div></section>
    <footer className="ir-footer"><div><strong>intent-runtime</strong><p>从当前有效请求到结构化意图。</p></div><div><a href={href("api/intent.html")}>API 参考</a><a href={href("testing/validation.html")}>测试与兼容</a><a href="https://devcodex-labs.github.io/schema-dsl/">schema-dsl ↗</a><a href={repository}>GitHub ↗</a></div><p>MIT · devcodex-labs</p></footer>
  </main>;
}
