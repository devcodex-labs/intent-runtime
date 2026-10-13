# 错误与失败恢复

技术失败抛出 IntentError，不把截断候选或设施异常返回为正常成功。字段问题保存在正常结果 issues。

| 技术码 | 含义 |
|---|---|
| INPUT_INVALID / CONFIG_INVALID / FIELD_UNKNOWN | 请求、可信配置或选择字段不合法 |
| SCHEMA_INVALID / SCHEMA_NOT_CONFIGURED / SCHEMA_UNSUPPORTED_FOR_EXTRACTION | 定义非法、未配置或超出明确矩阵 |
| EXECUTOR_NOT_CONFIGURED | Native/executor 没有执行器 |
| MODEL_AUTH_FAILED / MODEL_RATE_LIMITED / MODEL_REQUEST_FAILED | 认证、限流或模型请求失败 |
| MODEL_REFUSED / MODEL_OUTPUT_INCOMPLETE / MODEL_OUTPUT_INVALID | 拒绝、截断或候选结构/来源/不变量不合法 |
| MODEL_TIMEOUT / REQUEST_ABORTED / INSTANCE_DISPOSED | 显式期限、取消或释放 |
| RESOURCE_LIMIT | 指定容量或工作预算超限，details 给出 limit/allowed/observed/unit |
| INTERNAL_PROCESSING_FAILED | 本地设施或最终输出故障，stage=validation/output |
| HOST_REQUEST_NOT_FOUND / HOST_SUBMISSION_CONFLICT | 会话无记录，或 token/不同候选冲突 |

语义问题包括 AMBIGUOUS_REFERENCE、INTENT_INFORMATION_MISSING、CONSTRAINT_CONFLICT、RELATION_CONFLICT、CONTEXT_CONFLICT、CONTEXT_INCOMPLETE、UNCONFIRMED_INFERENCE。字段码包括 FIELD_REQUIRED_MISSING、FIELD_APPLICABILITY_UNKNOWN、FIELD_CARDINALITY_MISMATCH、FIELD_VALUE_INVALID、FIELD_DEPENDENCY_MISSING、FIELD_VALIDATION_UNDETERMINED、FIELD_INVALIDATED。

```js
try {await intent.parse(request, {signal});}
catch (error) {
  if (error instanceof IntentError) console.log(error.toJSON());
  else throw error;
}
```

序列化只包含 name/code/message/stage 和安全 details；cause 不枚举。标准技术错误消息稳定为通用英文，不包含用户原文或密钥。MCP 技术错误以 isError=true 与文本 `{error: ...}` 返回，不附 structuredContent 或 partialResult。

应用保存此前结果与原始消息；失败不会替应用清空状态。技术重试由调用方显式决定。新旧请求乱序由应用 revision 控制。字段未知不触发模型自动补事实。
