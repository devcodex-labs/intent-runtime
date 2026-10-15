# 接入 Codex

由当前Codex模型生成候选，Intent Runtime校验后返回结构化意图。此路径不需要额外模型API Key。CLI与Desktop的加载和兼容状态见[兼容与支持](/testing/validation)。

## 1. 保存配置

保存为 `intent.host.config.mjs`，例如Windows的 `D:\Worker\intent.host.config.mjs`，或macOS/Linux用户目录的同名文件。记录真实绝对路径。这个配置不导入包，可放在没有node_modules的目录。

<!-- example: examples/codex/intent.host.config.mjs -->
```js
export default {
  mode: 'host',
  instances: {orders: {language: 'zh-CN', schema: {
    type: 'object',
    properties: {orderId: {type: 'string', description: '用户明确提供的订单编号，保留前导零；仅适用于订单意图'}},
  }}},
};
```

配置是可信Node.js模块。自行添加包导入时，依赖必须能从配置文件所在目录解析；全局安装不改变任意ESM文件的本地依赖解析。

## 2. 安装与登记

核对所选发行包含本文V2入口。保存配置后，用两行安装和登记：

Windows PowerShell：

```powershell
npm install -g @devcodex/intent-runtime
intent-runtime setup --host codex --config "D:\Worker\intent.host.config.mjs"
```

macOS/Linux：

```bash
npm install -g @devcodex/intent-runtime
intent-runtime setup --host codex --config "$HOME/intent.host.config.mjs"
```

setup登记用户级MCP并在host模式安装Skill。按客户端要求重载配置，CLI开启新会话。应能发现intent_prepare、intent_accept、intent_cancel；普通npm安装不修改宿主。

## 3. 发起识别

在Codex明确提出：

```text
使用 intent-runtime，只解析请求，不执行订单查询。
instance=orders，fields=["orderId"]，原始input：查询订单000123，不取消订单。
先prepare，由当前模型按返回任务生成完整候选，再accept；无法完成时cancel。
```

应得到查询目标、禁止取消的约束和字符串编号000123。以accept的完整结果为准。Skill指导本次交接，不自动处理所有消息。

## 工具与回复

| 工具 | 输入 | 成功返回 |
|---|---|---|
| intent_prepare | Native请求加可选instance | HostTask：kind=model_task、requestId、submissionToken、instructions、input、outputSchema |
| intent_accept | requestId、submissionToken、完整candidateText字符串 | IntentResult |
| intent_cancel | requestId，可选reason=cancelled/refusal/incomplete | requestId、status=cancelled/already_cancelled/already_completed |

当前模型按HostTask材料和outputSchema生成候选，不按最终Result猜格式。服务端不另调模型。随包Skill对可纠正格式错误按明确反馈最多纠正一次；信息缺失或字段无法判断不触发格式纠正。无法完成时cancel，拒绝/截断分别用refusal/incomplete。

相同token和逐字相同候选并发共享校验；完成回复仍保留时可重放。不同候选冲突。显式纠正不重置校验预算。默认无识别期限；显式timeout从prepare开始。终态回复每adapter最多32项/8MiB，session关闭、进程重启或记录回收后需重新prepare。这些记录不替应用持久保存需求或对话。

## 手动填写 MCP 表单

| 字段 | 内容 |
|---|---|
| 名称 | intent-runtime |
| 类型 | STDIO |
| 启动命令 | intent-runtime-mcp的实际可执行路径 |
| 参数1 | --config |
| 参数2 | 配置文件绝对路径 |
| 工作目录 | 可访问的本地目录；不改变配置模块的包解析路径 |

手动登记同样的command/args不会安装Skill；使用上面的明确请求调用。日志写stderr，stdout仅传MCP。

## 检查与排障

```bash
intent-runtime doctor --host codex
```

| 现象 | 检查 |
|---|---|
| 找不到命令 | npm全局bin是否进入客户端PATH；必要时填绝对路径，Windows可使用对应.cmd入口 |
| 无法加载配置 | 绝对路径及.mjs后缀；找不到包时用本页无导入配置，或为配置所在项目安装依赖 |
| 只有intent_parse | 配置是否为executor；改host后按客户端要求重载 |
| 模型未完成候选 | 结束此识别，不把普通宿主回复当成功Result |
| HOST_REQUEST_NOT_FOUND | 是否换session/重启；重新prepare并传完整材料 |

诊断不调用模型。更新、修复与移除见[安装与维护](/guide/installation)。
