---
title: 错误与部分结果
description: 通过稳定错误码、阶段、issues 和 partialResult 处理配置、模型、提取与 Bridge 错误。
---

# 错误与部分结果

API 路径使用 `IntentParseError`，data 信息不满足定义时可能为其子类 `IntentDataError`；MCP 返回 `{ kind: "error", error: ... }`。按 code 分支，message 用于说明。

## 序列化结构

```ts
interface SerializedIntentError {
  code: ErrorCode;
  stage: "config" | "input" | "core" | "data" | "bridge";
  message: string;
  issues: {
    code: DataIssueCode | ErrorCode;
    category: "input" | "config" | "business_information" | "definition" | "processing";
    path: string | null;
    message: string;
  }[];
  partialResult?: IntentResult;
}
```

stage 表示错误发生位置，不能仅凭错误码假定阶段。issues.path 可为字段路径或 null；不同 issue category 区分输入、定义、业务信息与处理问题。

## 全部公开错误码

| code | 处理方向 |
| --- | --- |
| `CONFIG_INVALID` | 检查配置、依赖与明确必填项 |
| `SCHEMA_UNSUPPORTED` | 调整当前实现不支持的 Schema |
| `INPUT_INVALID` | 检查 input、context 和参数结构 |
| `UNKNOWN_FIELD` | 选择已定义的顶层字段 |
| `LIMIT_EXCEEDED` | 缩小材料或处理当前容量，不盲目重复提交 |
| `EXECUTOR_NOT_CONFIGURED` | API parse 配置 executor，或使用 Bridge 路径 |
| `INSTANCE_DISPOSED` | 实例已释放，活动识别被停止或无法开始新调用；创建新实例 |
| `MODEL_AUTH_FAILED` | 修正模型鉴权 |
| `MODEL_RATE_LIMITED` | 按应用策略等待或调整配额 |
| `MODEL_REQUEST_FAILED` | 检查服务商、网络或执行器错误 |
| `MODEL_TIMEOUT` | 模型 SDK、服务商或显式期限结束 |
| `MODEL_ABORTED` | 调用方取消或宿主停止活动任务 |
| `MODEL_REFUSED` | 模型拒绝生成候选 |
| `MODEL_OUTPUT_INCOMPLETE` | 模型未生成完整候选 |
| `MODEL_OUTPUT_INVALID` | 候选不满足输出契约且未修复成功 |
| `DATA_EXTRACTION_FAILED` | 检查业务信息与 issues，处理 partialResult |
| `HOST_CAPABILITY_UNSUPPORTED` | 调整实际模型/宿主能力与格式配置 |
| `BRIDGE_JOB_NOT_FOUND` | 原连接或任务不可用，必要时重新 prepare |
| `BRIDGE_JOB_EXPIRED` | 仅显式启用旧兼容 TTL 时可能出现 |
| `BRIDGE_STEP_CONFLICT` | 检查当前步骤令牌与候选是否已使用或冲突 |

安装维护 CLI 还有单独的安装错误码及状态，它们不属于上面的识别错误枚举，见[安装诊断与排障](../guide/installation.md#常见问题与处理)。

## 候选错误与业务信息问题

`MODEL_OUTPUT_INVALID` 表示模型提交的候选不满足契约，例如 JSON 格式错误、字段类型错误、缺少 evidence，或引用不在声明来源中。完整候选可按 `repairAttempts` 尝试修复；默认每阶段最多一次。

`DATA_EXTRACTION_FAILED` 表示材料中的真实业务信息或定义要求没有满足，例如必要值缺失、信息冲突、数量关系不符。它携带下面的 issues，直接终止，不要求模型通过修复猜测缺失事实。

鉴权、限流、请求失败、取消、拒绝和不完整输出也不触发候选修复。具体失败仍按实际 code 和 stage 处理。

## data 问题码

| issue code | 含义 |
| --- | --- |
| `DATA_REQUIRED_MISSING` | 必要信息缺失 |
| `DATA_AMBIGUOUS` | 有多个候选而无法明确选择 |
| `DATA_CONFLICT` | 材料中的信息冲突 |
| `DATA_CARDINALITY_MISMATCH` | 数量关系不符 |
| `DATA_VALUE_UNREPRESENTABLE` | 值无法由定义的类型表示 |
| `DATA_CONSTRAINT_VIOLATED` | 约束不满足 |
| `DATA_DEPENDENCY_MISSING` | 必要依赖信息缺失 |
| `DATA_DESCRIPTION_UNDETERMINED` | 无法确定业务描述是否满足 |
| `DATA_SOURCE_INVALID` | 公开枚举保留项；当前内置 data 校验不产生此 issue，来源引用错误按 MODEL_OUTPUT_INVALID 处理 |

模型候选不能自行提交 `DATA_SOURCE_INVALID` issue；当前实现会把它判为候选契约错误。引用存在也不证明引用的业务含义正确，语义仍需实际评审。

## partialResult 的含义

data 阶段出错时，已验证的默认字段可通过 partialResult 保留，其中 `data` 为 `{}`，不返回已提取成功的部分业务字段。可以显示已经理解的动作或发起澄清，再重新识别以获得完整扩展结果。

```js
import { IntentParseError } from "@devcodex/intent-runtime";

export function describeFailure(error) {
  if (!(error instanceof IntentParseError)) throw error;
  return {
    code: error.code,
    issues: error.issues,
    understood: error.partialResult ?? null,
  };
}
```

模型鉴权等错误也可能发生在已经完成 core 的 data 阶段，因此应检查实际 partialResult，而不只对 `DATA_EXTRACTION_FAILED` 读取它。
