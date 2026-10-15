# 配置参考

`new Intent(config)` 创建实例并快照配置。改变规则时创建新实例；之后修改原配置对象不会更新已创建的实例。模型执行器保留调用方服务对象的连接状态，库不关闭共享服务。

## 按任务查配置

| 你要做什么 | 需要配置 | 完整入口 |
|---|---|---|
| 首次识别目标与约束 | executor，可选 language | [快速开始](/guide/quick-start) |
| 提取订单编号 | schema，加请求 fields | [订单字段](/examples/index#订单字段提取) |
| 带上前轮材料 | 请求 context/baseline，不是新增实例会话配置 | [多轮指南](/guide/multi-turn) |
| 复用 Codex 当前模型 | host 配置，无需 executor | [Codex](/integrations/codex) |
| 详细证据、建议或语义标签 | defaultOutput/output，扩展需 extensionSchema | [输出选项](/guide/configuration#输出选项) |

保持默认 limits 与 timeoutMs 即可开始；它们不是首次接入必填项，也不替代宿主自己的连接配置。

## IntentConfig

| 路径 | 类型 / 必填 | 默认 | 用途与规则 |
|---|---|---|---|
| language | string / 否 | en | 解释文字的BCP 47语言标签；不翻译代码、编号或配置的动作标识 |
| executor | ModelExecutor / Native与executor模式需要 | 无 | 显式模型来源；host不调用它，无默认供应商 |
| schema | IntentSchema / 选择业务字段时需要 | 无 | schema-dsl@3.0.4 Builder或[支持的JSON Schema](/guide/fields) |
| extensionSchema | IntentSchema / 否 | 无 | 意图附加语义标签；顶层名不能与schema业务参数重名 |
| semantics | BusinessSemantics / 否 | 无 | 领域、术语、动作与正反例；不表示执行能力清单 |
| timeoutMs | 非负安全整数 / 否 | 0 | 0不加识别期限；正值含模型、校验、host等待，最大2147483647ms |
| defaultOutput | IntentOutputOptions / 否 | 各项false | 请求output按键覆盖，不替换整个默认对象 |
| limits | Partial&lt;IntentLimits&gt; / 否 | 见下表 | 容量/工作限制，均为正安全整数，不由MCP参数改变 |

配置与标准请求参数拒绝未知键，Context内部自由命名。Native可选顶层属性为undefined按省略；Context内部undefined不是JSON。无效配置通常在构造时抛错，见[错误参考](/api/errors)。

## semantics

本节行名相对 semantics，例如 terms[].name 的完整路径为 `semantics.terms[].name`。

| 路径 | 类型 / 必填 | 规则 |
|---|---|---|
| domain | string / 否 | 领域名称 |
| description | string / 否 | 业务说明 |
| terms | 数组 / 否 | 每项name、meaning非空；aliases为可选字符串数组 |
| actions | 数组 / 否 | 每项name、meaning非空；examples/counterExamples为可选字符串数组 |

| 完整嵌套路径 | 类型 / 必填 | 缺省 | 用途 |
|---|---|---|---|
| semantics.terms[].name | 非空 string / 是 | 无 | 术语名 |
| semantics.terms[].meaning | 非空 string / 是 | 无 | 术语的业务含义 |
| semantics.terms[].aliases | string[] / 否 | 省略 | 对应别名，不新增用户事实 |
| semantics.actions[].name | 非空 string / 是 | 无 | 明确匹配时保留的动作标识 |
| semantics.actions[].meaning | 非空 string / 是 | 无 | 动作含义 |
| semantics.actions[].examples | string[] / 否 | 省略 | 正例 |
| semantics.actions[].counterExamples | string[] / 否 | 省略 | 反例，帮助区分容易混淆的动作 |

同名含义冲突报CONFIG_INVALID。明确匹配的domain/action保留配置名称，不随输出语言翻译。定义帮助理解，不把未支持动作删除或把示例当用户事实。

## 输出选项

下表行名相对 `defaultOutput` 或请求 `output`，例如 `defaultOutput.evidence`、`request.output.evidence`。未指定时合并实例默认值。

| 路径 | 类型 / 默认 | 开启后 | 关闭后 |
|---|---|---|---|
| suggestions | boolean / false | 语义澄清/完善建议，无建议为[] | 不生成该附加部分 |
| evidence | boolean / false | 详细来源，无证据为[] | 必要来源、issues、inferences仍保留 |
| diagnostics | boolean / false | durationMs/modelCallCount | 不返回诊断部分 |
| extensions | boolean / false | 按extensionSchema提取全部扩展顶层字段 | 不提取新标签；仍处理旧扩展失效 |

`defaultOutput: {evidence:true}` 加 `output:{}` 仍开启证据；`output:{evidence:false}` 明确关闭。开启extensions却没有extensionSchema报SCHEMA_NOT_CONFIGURED；扩展不能绕过fields提取操作参数。

## limits

下表行名均相对 `limits`，例如完整路径 `limits.maxValidationChecks`。省略对象或其中某项均使用对应默认值。

| 路径 | 默认 | 统计范围 |
|---|---:|---|
| maxInputBytes | 65536 | 原input的UTF-8字节 |
| maxContextBytes | 1048576 | Context JSON |
| maxBaselineBytes | 1048576 | baseline JSON |
| maxSchemaBytes | 262144 | 每份业务/扩展Schema |
| maxRequestBytes | 3145728 | 静态材料与完整逻辑请求，不能仅分别检查各部分 |
| maxOutputBytes | 1048576 | 候选文本、HostTask、最终结果各自检查 |
| maxDepth | 64 | JSON根容器深度0 |
| maxConcurrentParses | 8 | 单个Intent的Native/host活动识别和未结束底层调用 |
| maxValidationChecks | 256 | 单次识别业务校验调用数；host纠正不重置 |

超限报RESOURCE_LIMIT，不静默截断。预算不等于会话过期。取消不配合的外部执行器可先返回，但名额在其实际结束后才释放。库不保证终止调用方任意代码或退还模型费用。

## 其他公开配置

- [模型API](/integrations/api)：ApiExecutorConfig、地址、格式、响应体字节限制。
- [MCP](/integrations/mcp)：IntentMcpAdapterConfig、独立服务配置、实例选择、前缀和协议。
- [Codex](/integrations/codex)与[维护命令](/guide/installation)：可信文件、环境路径、CLI参数及退出码。

完整类型见[类型参考](/api/types)。
