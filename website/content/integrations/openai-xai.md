---
title: OpenAI 与 xAI
description: 从 Node.js 应用显式配置 provider、model 和 apiKey，并理解 SDK 响应格式与错误行为。
---

# OpenAI 与 xAI

API 适配器使用 OpenAI SDK 的 Responses API。两种 provider 共用 `createApiExecutor`，模型名和凭据由调用方明确提供。

## 配置环境

API 路径需要安装可选 peer `openai`（支持 `>=6.49.0 <7`）。从源码执行 `npm ci` 已包含测试使用的 SDK。

PowerShell 示例，替换占位内容并仅在本地设置密钥：

```powershell
$env:INTENT_PROVIDER = "openai"
$env:INTENT_MODEL = "<支持所需响应格式的目标模型>"
$env:INTENT_OPENAI_KEY = "<你的本地密钥>"
```

使用 xAI 时，provider 改为 `xai`，设置 `INTENT_XAI_KEY`。这些环境变量是示例及评测工具使用的约定；适配器自身接收显式配置，不自动读取变量。

## 完整调用

```js
import { Intent, IntentParseError } from "@devcodex-labs/intent-runtime";
import { createApiExecutor } from "@devcodex-labs/intent-runtime/adapters/api";

const provider = process.env.INTENT_PROVIDER;
if (provider !== "openai" && provider !== "xai") throw new Error("明确选择 openai 或 xai");
const apiKey = provider === "openai" ? process.env.INTENT_OPENAI_KEY : process.env.INTENT_XAI_KEY;
if (!apiKey || !process.env.INTENT_MODEL) throw new Error("缺少模型名称或密钥");

const intent = new Intent({
  language: "zh-CN",
  executor: createApiExecutor({ provider, apiKey, model: process.env.INTENT_MODEL }),
});
try {
  console.log(await intent.parse({ input: "先给出方案，确认后再实施。", fields: [] }));
} catch (error) {
  if (error instanceof IntentParseError) console.error(error.toJSON());
  else throw error;
} finally {
  intent.dispose();
}
```

## 适配器选项

| 选项 | 默认值 / 行为 |
| --- | --- |
| `provider` | 必填，`openai` 或 `xai` |
| `apiKey` | 必填，非空字符串 |
| `model` | 必填，非空字符串，无自动选择 |
| `nativeJsonSchema` | true；是调用方对目标模型格式能力的声明，不是探测结果 |
| `maxOutputTokens` | 8192，正安全整数 |
| `fetch` | 可选的显式传输替换，用于受控测试等场景 |

OpenAI 使用 `https://api.openai.com/v1`；xAI 使用 `https://api.x.ai/v1`。适配器禁用自动 SDK 重试，不带业务工具，关闭 stream，并设置 `store: false`。模块的候选修复次数与网络重试是不同机制。

默认意图需要目标模型支持所需的 strict JSON Schema 响应格式。设置 `nativeJsonSchema: false` 不会把不支持格式的模型自动变为兼容模型；遇到不能承载的任务会返回 `HOST_CAPABILITY_UNSUPPORTED`。请按服务商当前文档核对模型能力，再执行真实联调。

## 等待、取消与错误

模块默认不增加 parse 总时限，SDK 和服务商仍有自己的等待限制。SDK 请求超时映射为 `MODEL_TIMEOUT`，请求取消映射为 `MODEL_ABORTED`；鉴权和限流分别对应 `MODEL_AUTH_FAILED`、`MODEL_RATE_LIMITED`。

处理异常使用 `IntentParseError` 的 code、stage、issues 和 partialResult。不要从错误 message 文案建立稳定分支，参见[错误参考](../api/errors.md)。

## 测试边界

受控 fetch 可以验证真正的 SDK 请求构造、响应提取、超时和取消映射，却没有请求真实模型。生产质量需要用目标模型分别运行语义数据集，记录模型版本、耗时和独立评审结果，见[测试与准确率](../testing/validation.md)。
