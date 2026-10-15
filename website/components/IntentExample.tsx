import {withBase} from '@rspress/core/runtime';

export default function IntentExample() {
  return <><p className="intent-version-note">本文对应 V2，开始前请查看<a href={withBase('/guide/installation')}>版本与安装方式</a>。</p><section className="intent-example" aria-label="意图结构化示例">
    <div className="intent-example-input">
      <span className="intent-example-label">用户请求</span>
      <p>查询订单 <strong>000123</strong>，<br />不取消订单。</p>
      <span className="intent-example-note">由调用方提供原文与字段定义</span>
    </div>
    <div className="intent-example-arrow" aria-hidden="true">→</div>
    <div className="intent-example-output">
      <span className="intent-example-label">理解结果 · 摘要</span>
      <dl>
        <div><dt>目标</dt><dd>查询订单</dd></div>
        <div><dt>约束</dt><dd>禁止取消订单</dd></div>
        <div><dt>参数</dt><dd><code>orderId: "000123"</code></dd></div>
      </dl>
      <span className="intent-example-note">识别意图后，由你的应用决定下一步</span>
    </div>
  </section></>;
}
