# 配置参考

`new Intent(config)` 在创建时快照配置，不读取业务环境。

| 参数 | 默认 | 用途 |
|---|---|---|
| executor | 未配置 | 可信 ModelExecutor；Native/executor MCP 要求；host 不调用它 |
| language | en | 有效 BCP 47 标签，支持登记标签、私用与扩展；业务解释遵循此语言 |
| schema | 未配置 | 字段定义；选择字段时必需 |
| extensionSchema | 未配置 | 扩展字段的独立定义；与业务顶层字段不能重名 |
| semantics | 未配置 | domain、description、terms、actions 解释术语和动作；不是工具能力列表 |
| timeoutMs | 0 | 0 无总期限；显式正整数覆盖整个识别，含 host 等待；最大 2147483647 |
| defaultOutput | 全 false | suggestions、evidence、diagnostics、extensions |
| limits | 下表 | 可信资源预算，MCP 调用者不能修改 |

terms 包含非空 name/meaning，可选 aliases；actions 包含非空 name/meaning，可选 examples/counterExamples。同名含义冲突为 CONFIG_INVALID。明确匹配的 domain/action 标识保留配置名称，不随输出语言翻译。

| limits | 默认值 | 作用域 |
|---|---:|---|
| maxInputBytes | 65536 | 当前 input 的 UTF-8 字节 |
| maxContextBytes / maxBaselineBytes | 各 1048576 | 各自 JSON |
| maxSchemaBytes | 262144 | 每份业务/扩展定义 |
| maxRequestBytes | 3145728 | 静态配置材料和完整逻辑请求材料 |
| maxOutputBytes | 1048576 | 每个候选文本、HostTask JSON、最终 Result 分别检查 |
| maxDepth | 64 | 根容器深度 0 |
| maxConcurrentParses | 8 | 同一 Intent 的 Native/host 活动识别及未结束底层工作 |
| maxValidationChecks | 256 | 每条识别实际业务 Validator 调用；host 纠正不重置 |

预算是容量/工作限制，不是默认超时。自定义执行器内部的任意分配不受本库物理约束。取消不配合的执行器会先返回取消，名额在底层实际结束后释放。
