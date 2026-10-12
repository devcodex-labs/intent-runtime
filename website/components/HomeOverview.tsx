import { useState } from "react";
import { Link } from "@rspress/core/theme";
import examples from "./home-examples.json";
import "./HomeOverview.css";

const capabilities = [
  {
    number: "01",
    title: "理解当前有效请求",
    text: "识别动作、对象与理解状态，保留要求、否定、条件和用户表达的顺序；结合显式上下文理解修正与撤回。",
    link: "/guide/intent-contract.html",
    label: "了解意图契约",
  },
  {
    number: "02",
    title: "提取所需业务字段",
    text: "用 JSON Schema 或 schema-dsl 定义业务字段，按需选择提取范围，对缺失、冲突和约束问题给出反馈。",
    link: "/guide/schema-fields.html",
    label: "定义 Schema 与字段",
  },
  {
    number: "03",
    title: "交付统一的理解结果",
    text: "校验模型候选的 JSON、结构与业务字段引用来源，输出统一结果或结构化错误；字段提取失败时保留已校验的默认意图。",
    link: "/api/response.html",
    label: "查看结果与错误",
  },
];

export function HomeOverview() {
  const [selected, setSelected] = useState(0);
  const example = examples[selected];
  return (
    <main className="intent-home">
      <div className="intent-home-meta" aria-label="运行与接入方式">
        <span>TypeScript / Node.js ≥20.0.0</span>
        <span>ESM</span>
        <span>MCP / 模型 API</span>
      </div>

      <section className="intent-home-demo" aria-labelledby="intent-demo-title">
        <div className="intent-home-heading">
          <p className="intent-home-eyebrow">看看应用会收到什么</p>
          <h2 id="intent-demo-title">从一句请求，到清楚的意图与数据</h2>
          <p>切换查看内置响应结构示例。示例配置 <code>language: "zh-CN"</code>，模型生成的说明措辞可以变化。</p>
        </div>
        <div className="intent-home-choices" role="group" aria-label="选择响应示例">
          {examples.map((item, index) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={selected === index}
              aria-controls="intent-home-example"
              onClick={() => setSelected(index)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="intent-home-example" id="intent-home-example">
          <div className="intent-home-input">
            <p className="intent-home-panel-label">原始请求 <code>input</code></p>
            <blockquote>{example.result.input}</blockquote>
            {example.context.length > 0 && (
              <div className="intent-home-context">
                <p className="intent-home-panel-label">显式上下文 <code>context</code></p>
                {example.context.map((message, index) => (
                  <p key={index}><code>{message.role}</code> {message.content}</p>
                ))}
              </div>
            )}
            <p className="intent-home-configuration">{example.configuration}</p>
            <p className="intent-home-note">{example.note}</p>
            <Link href="/api/response.html">阅读完整响应参考 <span aria-hidden="true">→</span></Link>
          </div>
          <div className="intent-home-output">
            <div className="intent-home-output-heading">
              <span>结构化结果</span>
              <code>IntentResult</code>
            </div>
            <pre key={example.id} tabIndex={0} aria-label={`${example.label}的完整 JSON 响应`}><code>{JSON.stringify(example.result, null, 2)}</code></pre>
          </div>
        </div>
      </section>

      <section className="intent-home-capabilities" aria-label="核心能力">
        {capabilities.map((item) => (
          <article className="intent-home-capability" key={item.number}>
            <span className="intent-home-number" aria-hidden="true">{item.number}</span>
            <h2>{item.title}</h2>
            <p>{item.text}</p>
            <Link href={item.link}>{item.label} <span aria-hidden="true">→</span></Link>
          </article>
        ))}
      </section>

      <section className="intent-home-integrations" aria-labelledby="intent-integrations-title">
        <div className="intent-home-heading">
          <p className="intent-home-eyebrow">按你的使用场景接入</p>
          <h2 id="intent-integrations-title">接入你的客户端、应用或已有 MCP</h2>
          <p>语义理解由接入的大模型完成，模块负责识别流程、候选校验与结果组装。</p>
        </div>
        <div className="intent-home-paths">
          <article className="intent-home-path">
            <span className="intent-home-path-tag">AI 客户端</span>
            <h3>使用当前 Codex 模型</h3>
            <p>全局安装自动配置检测到的 Codex CLI / Desktop，并安装识别 Skill。无需另配模型 API key。</p>
            <pre tabIndex={0} aria-label="全局安装命令"><code>npm install -g @devcodex/intent-runtime</code></pre>
            <p className="intent-home-path-note">重载客户端后明确启用识别流程。新建 default 实例不含业务 Schema，说明语言默认为 en。</p>
            <div className="intent-home-links">
              <Link href="/integrations/codex-cli.html">Codex CLI <span aria-hidden="true">→</span></Link>
              <Link href="/integrations/codex-desktop.html">Codex Desktop <span aria-hidden="true">→</span></Link>
            </div>
          </article>
          <article className="intent-home-path">
            <span className="intent-home-path-tag">应用开发</span>
            <h3>从 Node.js 应用调用</h3>
            <p>显式配置 OpenAI、xAI 或自定义 ModelExecutor，把结构化结果接入已有的业务逻辑。</p>
            <pre tabIndex={0} aria-label="配置实例后的调用示意"><code>{"await intent.parse({ input, context, fields });"}</code></pre>
            <p className="intent-home-path-note">配置模型、所需业务字段与输出语言；应用决定如何使用识别结果。</p>
            <div className="intent-home-links">
              <Link href="/integrations/openai-xai.html">API 接入 <span aria-hidden="true">→</span></Link>
              <Link href="/api/intent.html#modelexecutor">自定义执行器 <span aria-hidden="true">→</span></Link>
              <Link href="/integrations/existing-mcp.html">嵌入已有 MCP <span aria-hidden="true">→</span></Link>
            </div>
          </article>
        </div>
      </section>

      <section className="intent-home-boundary" aria-labelledby="intent-boundary-title">
        <div>
          <p className="intent-home-eyebrow">在应用中的位置</p>
          <h2 id="intent-boundary-title">理解结果，由你的应用继续处理</h2>
        </div>
        <div>
          <p>模块表达当前请求与所选业务数据。完成目标的步骤推断、能力与工具匹配、业务授权和执行由上层应用负责。</p>
          <p>上下文由调用方提供；ready 表示理解状态。结构与来源校验能发现部分错误，语义质量仍需在目标模型上评测。</p>
          <Link href="/guide/introduction.html">了解职责与适用场景 <span aria-hidden="true">→</span></Link>
        </div>
      </section>
    </main>
  );
}
