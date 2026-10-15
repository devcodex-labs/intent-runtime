# Native API

根入口提供 `Intent`、`IntentError`、只读 `INTENT_RESULT_SCHEMA` 与公共类型。模型API和MCP是独立导出入口，见[接入选择](/guide/quick-start)。

| 要查什么 | 位置 | 失败形式 |
|---|---|---|
| 初始化与可信配置 | [Intent](#intent)、[配置参考](/guide/configuration) | 构造同步抛错 |
| 输入、Context、baseline、字段与取消 | [parse 参数](#parse参数) | Promise reject；正常 issues 不等于 reject |
| 关闭与再次调用 | [Intent](#intent) | dispose 幂等；关闭后 parse 拒绝 |
| 序列化错误 | [IntentError](#intenterror) | 默认安全摘要，可显式选择已有 partialResult |
| 自有模型 | [ModelExecutor](#modelexecutor) | 生成候选，不直接生成最终结果 |

## Intent

```ts
class Intent {
  constructor(config: IntentConfig);
  parse(request: IntentParseRequest, options?: IntentParseOptions): Promise<IntentResult>;
  dispose(): Promise<void>;
}
```

构造时检查并快照配置，无效配置同步抛出IntentError。parse异步返回结果，失败拒绝Promise。dispose幂等，结束所属识别和自有资源；不关闭调用方共享执行器，也不无限等待不合作的外部Promise。释放后parse报INSTANCE_DISPOSED。

### parse参数

| 路径 | 类型 / 必填 | 默认 | 行为 |
|---|---|---|---|
| request.input | 非空白string / 是 | 无 | 原始用户输入，结果原样保留 |
| request.fields | string[]或'all' / 否 | [] | 顶层业务字段；去重保持首次顺序；未知名FIELD_UNKNOWN |
| request.context | object / 否 | 无 | 运行时必须为JSON根对象；内部自由命名 |
| request.baseline | EffectiveIntentSnapshot / 否 | 无 | 可选旧effective，版本/结构不符INPUT_INVALID |
| request.referenceTime | string / 否 | 无 | 带时区ISO日期时间；不默认取本机时间 |
| request.output | IntentOutputOptions / 否 | 实例默认 | 按项覆盖，{}不清空默认 |
| options.signal | AbortSignal / 否 | 无 | 只取消本条识别，不放入JSON请求 |

不修改传入材料；同实例反复parse不隐式继承历史。Context根数组/null/类实例无效，内部函数、循环、访问器、undefined、非有限数字等不是JSON。标准参数未知键拒绝；此规则不限制Context内业务键。fields非空或all而无schema报SCHEMA_NOT_CONFIGURED；extensions开启而无定义同样报错。

先看[如何读取结果](/guide/results)，需要核对字段时查[完整IntentResult](/api/response)。初始化参数见[配置参考](/guide/configuration)，多轮见[材料续传](/guide/multi-turn)。

## IntentError

```ts
class IntentError extends Error {
  constructor(code: IntentErrorCode, options?: IntentErrorOptions);
  readonly code: IntentErrorCode;
  readonly stage: IntentErrorStage;
  readonly details?: IntentErrorDetails;
  readonly partialResult?: IntentResult;
  readonly cause?: unknown;
  toJSON(): SerializedIntentError;
  serialize(options?: ErrorSerializationOptions): SerializedIntentError;
}
```

code决定通用英文消息；未知code抛TypeError。options可指定stage/details/cause。toJSON等价于默认serialize；`serialize({includePartialResult:true})`仅在错误确有partialResult时附加，默认不附加。cause不枚举也不进入标准摘要。

partialResult并非每次错误都有，可能包含原始材料；不是正常成功结果。MCP技术错误不返回partialResult。不要把diagnostics当作允许打印全部错误原文的开关。错误码和恢复见[错误参考](/api/errors)。

## INTENT_RESULT_SCHEMA

与成功结果版本一致的只读Draft-07 JSON Schema数据，含完整本地定义/引用。可用于验证Result结构，不是业务字段Schema、候选Schema、格式化函数或模型质量保证。给需要修改Schema的SDK时先深拷贝，不修改共享导出。

## ModelExecutor

```ts
interface ModelExecutor {
  readonly id: string;
  generate(request: ModelRequest): Promise<ModelReply>;
}
type ModelRequest = {
  instructions: string;
  input: JsonObject;
  outputSchema: object;
  signal: AbortSignal;
};
type ModelReply =
  | {outcome: 'complete'; text: string}
  | {outcome: 'refusal' | 'incomplete'; reason?: string};
```

构造Intent时捕获id和generate入口；共享连接仍由调用方管理。generate用真实模型生成符合给定outputSchema的一份候选文本，不直接返回最终IntentResult。响应signal，不附加未提供的历史或业务工具。Native每条识别生成一次，不隐式重试、切换模型或降级输出格式。

[模型接入](/integrations/api)给出API配置与完整自定义执行器文件。[完整类型](/api/types)含所有嵌套定义。
