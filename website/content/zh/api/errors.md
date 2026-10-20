# 错误与失败恢复

与核心证明相符的冗余正式字段诊断会归并到保留的问题，同时维护来源、候选、澄清问题和建议引用。与正式证明矛盾的声明仍返回 `MODEL_OUTPUT_INVALID`，并在可定位时提供候选路径。推断定位到 `inputs`、`extensions` 容器或其后代也属于非法候选，应使用真实语义位置表达未确认假设。普通业务值非法仍通过正常字段结果和 data 问题返回。

技术失败抛出 IntentError，不把截断候选或设施异常返回为正常成功。字段问题保存在正常结果 issues。

没有结果时先看是否抛错；有结果但缺订单号时先看fieldResults与issues。超时、认证失败和缺少用户信息需要不同的恢复动作；不要统一重试。Codex没有工具或无法启动先查[登记与启动](/zh/operations/codex)，随后再排查识别本身。

| 示例 | 可观察结果 | 应对 |
|---|---|---|
| 选 orderId，但实例没有 schema | Promise 拒绝，SCHEMA_NOT_CONFIGURED | 补正确 Schema 并新建实例，或不需要字段时不选择 |
| Schema 已配置，用户未给必需订单号 | 正常 IntentResult，字段及 issues 说明缺失 | 向用户补问，不把业务缺失当网络故障 |
| 只有 VIP 改为 false，旧优惠15超出非VIP规则 | 正常结果，discount invalidated | 不消费旧值，下一轮选择 discount 并提供合法值 |

完整恢复过程是“确认 code/问题类别 → 修复对应输入或配置 → 显式新调用 → 检查新结果”，不是默认重试所有失败。MCP 外层错误形式见[信封](/zh/api/mcp#成功与错误信封)。

结构失败使用 MODEL_OUTPUT_INVALID、stage='validation'，在 details.violations 返回有限长度的 JSON Pointer，例如 /relations、/nodes/0/action、/observations/0/path。OpenAI 完整回复中的坏传输候选属于候选失败，不是认证或网络错误。未支持的本地投影形状在请求前报 CONFIG_INVALID 并提供 outputSchema 路径。严格输出不会补造业务数据，也不会绕过来源与语义检查。

规范候选诊断会将坏节点引用定位到 `/relatedKeys/1`，错误快照变化路径定位到 `/changes/0/deltaHints/0/path`，对已有意图执行的 applied `add` 定位到 `/changes/0/operation`（`SEMANTIC_INVARIANT`）。OpenAI 传输层可能更早以 `STRUCTURE` 拒绝这些组合；调用方应读取实际 rule/path，不假设固定发生在同一校验阶段。

| 技术码 | 含义 |
|---|---|
| INPUT_INVALID / CONFIG_INVALID / FIELD_UNKNOWN | 请求、可信配置或选择字段不合法 |
| SCHEMA_INVALID / SCHEMA_NOT_CONFIGURED / SCHEMA_UNSUPPORTED_FOR_EXTRACTION | 定义非法、未配置或超出明确矩阵 |
| EXECUTOR_NOT_CONFIGURED | Native/executor 没有执行器 |
| MODEL_AUTH_FAILED / MODEL_RATE_LIMITED / MODEL_REQUEST_FAILED | 认证、限流或模型请求失败 |
| MODEL_REFUSED / MODEL_OUTPUT_INCOMPLETE / MODEL_OUTPUT_INVALID | 拒绝、截断或候选结构/来源/不变量不合法 |
| MODEL_TIMEOUT / REQUEST_ABORTED / INSTANCE_DISPOSED | 显式期限、取消或释放 |
| RESOURCE_LIMIT | 指定容量或工作预算超限；按 details 中可用的 limit/allowed/unit/path 定位，observed 仅在已知时提供 |
| INTERNAL_PROCESSING_FAILED | 本地设施或最终输出故障，stage=validation/output |
| HOST_REQUEST_NOT_FOUND / HOST_SUBMISSION_CONFLICT | 会话无记录，或 token/不同候选冲突 |

资源检查可能在确认超限后提前停止，不继续计算全部材料的大小。`details.observed` 未提供不表示 0；调用方应按可用属性显示诊断。例如将 `limits.maxContextBytes` 设为16，传入超限的 Context，可能得到以下安全摘要：

```json
{
  "name": "IntentError",
  "code": "RESOURCE_LIMIT",
  "message": "Resource limit exceeded.",
  "stage": "input",
  "details": {"limit": "maxContextBytes", "allowed": 16, "unit": "bytes", "path": "/context"}
}
```

语义问题包括 AMBIGUOUS_REFERENCE、INTENT_INFORMATION_MISSING、CONSTRAINT_CONFLICT、RELATION_CONFLICT、CONTEXT_CONFLICT、CONTEXT_INCOMPLETE、UNCONFIRMED_INFERENCE。字段码包括 FIELD_REQUIRED_MISSING、FIELD_APPLICABILITY_UNKNOWN、FIELD_CARDINALITY_MISMATCH、FIELD_VALUE_INVALID、FIELD_DEPENDENCY_MISSING、FIELD_VALIDATION_UNDETERMINED、FIELD_INVALIDATED。

## 按发生位置恢复

先区分正常结果里的issues和技术异常。歧义、缺字段、字段无效通常是识别结果的一部分，不应统一当成网络失败重试。

| 现象或代码 | 先检查什么 | 调用方下一步 |
|---|---|---|
| SCHEMA_NOT_CONFIGURED | fields或extensions是否启用，对应Schema是否存在 | 补配置后新建实例；不需要字段时显式使用fields=[] |
| FIELD_UNKNOWN / SCHEMA_INVALID / CONFIG_INVALID | 字段名、规则支持范围、模型/配置参数 | 修正请求或可信配置；重复原调用不会修好配置 |
| FIELD_REQUIRED_MISSING / FIELD_DEPENDENCY_MISSING | issues是否缺少用户值或条件依据 | 向用户补问，下一轮传相关Context/baseline及所选字段 |
| FIELD_VALUE_INVALID / FIELD_INVALIDATED | 候选是否违反规则，旧值是否因修改失效 | 不消费无效值；让用户明确提供合法替代值，再识别 |
| FIELD_VALIDATION_UNDETERMINED | 本地证明能力是否不足；查看字段说明与规则范围 | 保留unknown，检查Schema与支持范围；更多输入未必能解决，不靠补默认值或盲目重试 |
| AMBIGUOUS_REFERENCE等正常issues | 指代与候选是否齐全 | 根据questions澄清，再传回对应问题和候选 |
| MODEL_OUTPUT_INVALID | 安全details.violations中的路径/规则 | Native由应用决定是否重新识别；host只能按明确反馈提交纠正候选，不能重置同次校验预算 |
| MODEL_AUTH_FAILED / MODEL_RATE_LIMITED / MODEL_REQUEST_FAILED | 凭据、权限、额度、供应商状态与网络 | 修复认证或等待服务恢复；是否重试、何时重试由应用决定 |
| MODEL_REFUSED / MODEL_OUTPUT_INCOMPLETE | 模型拒绝或生成未完成 | 不解析截断文本；调整输入或生成上限后由应用明确重试 |
| RESOURCE_LIMIT | details 中可用的 limit、allowed、unit、path；observed 可省略 | 缩小相关材料或合理调整可信配置；maxValidationChecks超限时结束本次识别 |
| HOST_REQUEST_NOT_FOUND | session是否关闭、进程是否重启、终态记录是否回收 | 用完整材料重新prepare，再用新requestId/token提交候选 |
| HOST_SUBMISSION_CONFLICT | 是否混用请求、token或同一请求的不同候选 | 保持原交接身份；需要新识别时重新prepare，不覆盖另一次提交 |
| REQUEST_ABORTED / MODEL_TIMEOUT | 调用方signal或显式timeoutMs | 保留上次状态；需要继续时发起新识别，默认timeoutMs=0无需增加期限 |
| INSTANCE_DISPOSED / INTERNAL_PROCESSING_FAILED | 实例是否释放；code/stage与部署版本 | 已释放则新建实例；内部失败保留安全摘要并反馈，不把partialResult直接当成功 |

这些恢复动作属于调用方流程，不会由Runtime自动执行。host的格式纠正仅针对明确反馈；与知识缺失、字段unknown或业务授权分开。

```js
import {IntentError} from '@devcodex/intent-runtime';

async function parseWithErrorSummary(intent, request, signal) {
  try {return await intent.parse(request, {signal});}
  catch (error) {
    if (error instanceof IntentError) console.error(error.toJSON());
    throw error;
  }
}
```

序列化只包含 name/code/message/stage 和安全 details；cause 不枚举。标准技术错误消息稳定为通用英文，不包含用户原文或密钥。MCP 技术错误以 isError=true 与文本 `{error: ...}` 返回，不附 structuredContent 或 partialResult。

应用保存此前结果与原始消息；失败不会替应用清空状态。技术重试由调用方显式决定。新旧请求乱序由应用 revision 控制。字段未知不触发模型自动补事实。

上例是调用方辅助函数，不是SDK新增方法；Intent生命周期仍由调用方管理。PROCESSING_INCOMPLETE仅出现在技术失败已核实的partialResult中，不表示一份被截断的文本可当作正常结果。默认toJSON不附partialResult，完整结果可能含原始材料；明确需要时再用serialize选项，见[IntentError](/zh/api/intent#intenterror)。
