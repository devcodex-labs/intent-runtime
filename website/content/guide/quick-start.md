---
title: 快速开始
description: 选择 Codex MCP 或 API 路径，完成安装、配置与第一次结构化识别。
---

# 快速开始

先选择接入方式：希望使用当前 Codex 模型，走 MCP；希望从 Node.js 应用直接请求指定模型，走 API。

## Codex：全局安装

安装 Node.js ≥20.0.0，并至少启动一次 Codex 客户端后执行：

```bash
npm install -g @devcodex/intent-runtime
```

直接全局安装会检测客户端、注册用户级 MCP、安装识别 Skill，并检查真实 MCP 连接。完成后重新启动 Codex CLI 或重载 Desktop；在会话中明确启用识别工作流。

可发送：

```text
请使用 intent-runtime 识别下面的原始请求，只返回最终结构化意图，不执行业务动作：
查询订单 000123
```

自动生成的 instance 名为 `default`，默认不含业务 Schema，结构化说明语言为 `en`。要提取 `orderId` 或改为中文说明，按[配置与多实例](./configuration.md)编辑业务配置后重载客户端。

MCP 成功回复为 `{ kind: "result", result: ... }`，SDK 工具结果中的完整意图位于 `structuredContent.result`。字段与状态见[响应结构](../api/response.md)，外层封装见 [Bridge 与 MCP](../api/bridge-mcp.md#mcp-外层返回)。

## 从当前源码本地测试

在项目根目录执行。`npm ci` 是本地依赖安装，不会修改 Codex 配置。

```powershell
cd D:\Worker\intent-runtime
npm ci
npm run build
```

可以按 [Desktop 手动配置](../integrations/codex-desktop.md#从源码手动配置)直接接入，也可以测试全局安装的完整行为：

```powershell
$packed = npm pack --pack-destination .. --json | ConvertFrom-Json
npm install -g (Join-Path .. $packed[0].filename)
```

输出包名以 `npm pack` 实际显示的文件名为准。包保存在项目同级，方便本地检查和清理。

## API：从应用调用

在应用中安装：

```bash
npm install @devcodex/intent-runtime openai
```

`openai` 是 API 路径使用的可选 SDK，同时负责 OpenAI 和 xAI 请求；MCP 路径无需额外安装它。明确提供模型和凭据：

```js
import { Intent, IntentParseError } from "@devcodex/intent-runtime";
import { createApiExecutor } from "@devcodex/intent-runtime/adapters/api";

const apiKey = process.env.INTENT_OPENAI_KEY;
const model = process.env.INTENT_MODEL;
if (!apiKey || !model) throw new Error("请先配置目标模型和本地密钥");

const intent = new Intent({
  language: "zh-CN",
  executor: createApiExecutor({
    provider: "openai",
    apiKey,
    model,
  }),
});

try {
  const result = await intent.parse({ input: "分析登录失败原因，先不要修改代码。", fields: [] });
  console.log(result);
} catch (error) {
  if (error instanceof IntentParseError) console.error(error.toJSON());
  else throw error;
} finally {
  intent.dispose();
}
```

上例需要设置有效的环境变量，并选择支持所需响应格式的目标模型。模型名没有模块默认值。完整步骤见 [OpenAI 与 xAI](../integrations/openai-xai.md)。

本例直接得到以下结构的结果；具体说明措辞可以变化：

<!-- response: quick-start -->
```json
{
  "input": "分析登录失败原因，先不要修改代码。",
  "normalizedInput": "分析登录失败原因，暂不修改代码。",
  "primaryIntent": "分析登录失败原因",
  "requirements": [],
  "intents": [
    { "id": "i1", "action": "analyze", "target": "登录失败原因", "requirements": [], "status": "ready" }
  ],
  "prohibitions": ["暂不修改代码"],
  "data": {}
}
```

需要澄清、等待确认、条件动作、多动作和业务字段等完整输出见[响应结构](../api/response.md)。识别失败时，API 捕获错误并用 toJSON() 获取[错误结构](../api/errors.md#完整失败示例)。

## 检查安装

```bash
intent-runtime doctor
```

它会检查实际注册和 MCP 往返，不会运行用户业务或请求真实模型。禁用了 npm 安装脚本时，可用 `intent-runtime doctor --repair` 完成配置。更多行为见[安装与维护](./installation.md)。
