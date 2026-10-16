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

先按[安装与版本](/guide/installation)完成全局安装，再将下面配置路径换为真实绝对路径执行登记。安装提供命令，setup才修改本模块的宿主登记：

Windows PowerShell：

```powershell
intent-runtime setup --host codex --config "D:\Worker\intent.host.config.mjs"
```

macOS/Linux：

```bash
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

| 你看到的内容 | 说明 | 是否最终识别结果 |
|---|---|---|
| prepare 的 HostTask | 提供 instructions、input、outputSchema 和本次交接身份 | 否 |
| 模型生成的 candidateText | 当前模型对给定材料的候选理解，交给 accept 校验 | 否 |
| accept 的 IntentResult | 校验和组装后的完整结构，读取字段状态与 issues | 是 |
| 普通聊天回复或 cancel 状态 | 说明或本次交接结束 | 否 |

工具可见但尚未完成 prepare/accept，只证明登记成功。第一次验证时确认完整链路；随后再次识别要显式传相关材料，MCP 连接不会替你保存业务对话。

## 工具与回复

首次识别按上面的prepare → 当前模型生成候选 → accept完成；无法完成时cancel。完整参数、令牌回放、预算和记录回收见[宿主交接参考](/api/mcp#宿主交接)。记录只服务本次识别，不是应用的持久会话。

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

诊断不调用模型。更新、修复、移除、dry-run、全部命令选项和退出码见[Codex安装维护](/operations/codex)。
