# Native API 与执行器

根入口导出 Intent、IntentError、公共类型和只读 INTENT_RESULT_SCHEMA。API 和 MCP 使用独立入口，不自动加载到根入口。

```ts
class Intent {
  constructor(config: IntentConfig);
  parse(request: IntentParseRequest, options?: IntentParseOptions): Promise<IntentResult>;
  dispose(): Promise<void>;
}
```

| parse request | 规则 |
|---|---|
| input | 必填非空字符串；结果原样保留 |
| fields | 可选 [] / 字段数组 / all，默认 [] |
| context | 可选自由 JSON 对象，不要求 role/content/id，不获得指令权限 |
| baseline | 可选上次 effective，版本必须 2.0-draft.6 |
| referenceTime | 可选有效带时区 ISO 日期时间；相对时间不能默认使用本机当前时间 |
| output | 四个布尔输出开关，按实例默认合并 |
| options.signal | JSON 之外的 AbortSignal；只影响本次调用 |

调用不隐式继承上轮材料，也不修改请求对象。dispose 幂等，终止所属识别并等待自有 worker 退出，不关闭调用方共享执行器。释放后调用报 INSTANCE_DISPOSED。

```ts
interface ModelExecutor {
  readonly id: string;
  generate(request: {
    instructions: string;
    input: JsonObject;
    outputSchema: object;
    signal: AbortSignal;
  }): Promise<ModelReply>;
}
type ModelReply =
  | {outcome: 'complete'; text: string}
  | {outcome: 'refusal' | 'incomplete'; reason?: string};
```

自定义网关用真实模型生成匹配 outputSchema 的一份候选文本，不返回完整 IntentResult 冒充核心。遵循 signal；将已知网关错误显式映射为 IntentError。每次 parse 只生成一次，无隐式重试、审判模型或降级。
