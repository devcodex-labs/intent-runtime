# Codex 与独立 stdio

本版维护只支持 Codex。CLI 与 Desktop 的实际加载需分别验证；服务端协议测试不能代替客户端验收。

```js
import {s} from 'schema-dsl/pure';
export default {
  mode: 'host',
  instances: {orders: {language: 'zh-CN', schema: s({orderId: s('string!').description('明确订单编号，保留前导零')})}},
};
```

保存为可信绝对 `.mjs` 文件，运行 setup；或手工配置 Codex：

```toml
[mcp_servers.intent-runtime]
command = "intent-runtime-mcp"
args = ["--config", "/absolute/path/intent.host.config.mjs"]
```

Windows 使用可执行文件真实绝对路径，表单每个参数单独填写。配置模块只向 stderr 输出日志。独立服务帮助/版本不启动服务；无效标志/缺路径退出 2，加载/启动失败退出 1，正常 stdin 结束或 SIGINT/SIGTERM 退出 0。

host 暴露 intent_prepare、intent_accept、intent_cancel：

1. prepare 接收 Native 参数加 instance，保存材料并返回 HostTask：kind/model_task、requestId、submissionToken、instructions、input、outputSchema。
2. 当前宿主按任务产生一份完整候选文本，accept 提交 requestId/token/candidateText。服务端共用 Native 核心、真实业务 Validator 和结果组装，不调用额外模型、Sampling 或独立 Codex 回合。
3. 无法生成则 cancel；reason 为 cancelled/refusal/incomplete，分别保存取消/拒绝/截断。

相同 token 和逐字相同候选并发提交共享校验；完成回复保留期间可重放，不生成新 ID。不同候选冲突。格式错误或候选容量拒收允许明确纠正；已用业务验证预算继续累计。设施故障、工作预算耗尽、最终输出超限为终态。

默认 timeoutMs=0 无等待 TTL；显式期限自 prepare 开始。活动请求共享 Intent 名额。终态缓存每 adapter 最多 32 项且 8MiB，先回收最早终态，不回收活动请求。session 关闭/进程重启/记录回收后无法恢复，需要重新 prepare；这是短期识别交接，不是业务任务库。

用户可明确请求：使用 intent-runtime 只解析“查询订单000123”，instance=orders、fields=[orderId]，不执行查询；先 prepare，由当前模型按返回任务生成，再 accept；无法完成时 cancel。setup 安装的 Skill 提供此流程，不会自动作用于每条消息。
