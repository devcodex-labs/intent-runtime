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
| `INSTANCE_DISPOSED` | 创建新实例 |
| `MODEL_AUTH_FAILED` | 修正模型鉴权 |
| `MODEL_RATE_LIMITED` | 按应用策略等待或调整配额 |
| `MODEL_REQUEST_FAILED` | 检查服务商、网络或执行器错误 |
| `MODEL_TIMEOUT` | 模型 SDK、服务商或显式期限结束 |
| `MODEL_ABORTED` | 调用方取消、实例释放或宿主停止 |
| `MODEL_REFUSED` | 模型拒绝生成候选 |
| `MODEL_OUTPUT_INCOMPLETE` | 模型未生成完整候选 |
| `MODEL_OUTPUT_INVALID` | 候选不满足输出契约且未修复成功 |
| `DATA_EXTRACTION_FAILED` | 检查业务信息与 issues，处理 partialResult |
| `HOST_CAPABILITY_UNSUPPORTED` | 调整实际模型/宿主能力与格式配置 |
| `BRIDGE_JOB_NOT_FOUND` | 原连接或任务不可用，必要时重新 prepare |
| `BRIDGE_JOB_EXPIRED` | 仅显式启用旧兼容 TTL 时可能出现 |
| `BRIDGE_STEP_CONFLICT` | 检查当前步骤令牌与候选是否已使用或冲突 |

安装维护 CLI 还有单独的安装错误码及状态，它们不属于上面的识别错误枚举，按 `doctor --json` 的实际诊断处理。

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
| `DATA_SOURCE_INVALID` | 来源或精确引用无效 |

## partialResult 的含义

data 阶段出错时，已验证的默认字段可通过 partialResult 保留，data 为尚未成功的扩展范围。可以显示已经理解的动作或发起澄清，不把这个部分结果当成完整扩展成功。

```js
import { IntentParseError } from "@devcodex-labs/intent-runtime";

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
