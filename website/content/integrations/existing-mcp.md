---
title: 嵌入已有 MCP
description: 将 intent-runtime 注册到已有 MCP 的工具列表，复用识别分发并保留原工具、资源和 Prompt。
---

# 嵌入已有 MCP

在业务项目本地安装模块，由已有 MCP 注册 Adapter 的工具，并把调用交给对应 session。模块不创建或替换宿主 Server，不修改 Codex 配置，也不执行识别出的业务动作。

Adapter 属于下一兼容版本新增接口；当前源码可构建使用，npm 1.0.2 使用现有 [Bridge 手动接入](../api/bridge-mcp.md)。

## 选择模型模式

| 需求 | 模式 | 工具与前提 |
| --- | --- | --- |
| 客户端一次 tools/call 取得最终结果 | executor | intent_parse；服务器明确配置 API/custom executor |
| 复用客户端当前模型 | host | prepare/accept/cancel；宿主在每次任务返回后生成候选 |

两模式都接受显式 input/context/fields 和命名实例。模块不会读取宿主聊天历史。缺 executor 的实例不能自动成为单次调用模式。

## SDK v1 完整注册示例

下面是已有服务器合并工具的完整 stdio 例子，原 echo 路径继续可用。`session.callTool()` 复用模块分发和返回装配；实际应用将原 registry 和 handler 合并到相同位置。

```js
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema, McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { Intent } from "@devcodex/intent-runtime";
import { createIntentMcpAdapter } from "@devcodex/intent-runtime/mcp/adapter";

const intent = new Intent({ language: "zh-CN" });
const adapter = createIntentMcpAdapter({ instances: { general: intent } });
const session = adapter.connect();
const server = new Server({ name: "project-mcp", version: "1.0.0" }, {
  capabilities: { tools: {} },
  instructions: "实例 general。识别时调用 intent_prepare，工具返回后按任务生成完整 JSON 并提交 intent_accept，重复到 result/error；生成失败时取消。",
});
/** @type {import("@modelcontextprotocol/sdk/types.js").Tool[]} */
const originalTools = [{ name: "echo", inputSchema: { type: "object", properties: { text: { type: "string" } } } }];
const originalNames = new Set(originalTools.map(tool => tool.name));
if (adapter.tools.some(tool => originalNames.has(tool.name))) throw new Error("工具名称冲突。");
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [...originalTools, ...adapter.tools] }));
server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  const reply = await session.callTool(request.params.name, request.params.arguments, { signal: extra.signal });
  if (reply) return { ...reply };
  if (request.params.name === "echo") return { content: [{ type: "text", text: String(request.params.arguments?.text ?? "") }] };
  throw new McpError(ErrorCode.InvalidParams, "未知工具。");
});
server.onclose = () => { session.close(); adapter.close(); intent.dispose(); };
try { await server.connect(new StdioServerTransport()); }
catch (error) { session.close(); adapter.close(); intent.dispose(); throw error; }
```

该 SDK 要求 tools/list 中 inputSchema.type 为对象。在实际代码中按其类型声明注册 metadata，完整英文实例见仓库 examples/shared/register-mcp-v1.mjs 和两种模式的 server/client 文件。

已有 onclose 时保留并调用它；已有 resources/prompts/服务器标识继续由原服务器维护。库的 adapter API 不接收 Server 类，上例是宿主自己的注册胶水。高层 McpServer.registerTool 所需的 Zod/其他 Schema 格式须正确适配，不能把普通 JSON Schema 当作 Zod 对象。

## executor 模式

安装 API 路径的可选 SDK，明确 provider/model/key；按 [API 配置](./openai-xai.md)创建 executor，再创建 Intent。Adapter 配置改为 mode:executor，调用 intent_parse 并传 instance/input/context/fields，成功 structuredContent 直接为 IntentResult。

完整运行：examples/mcp/executor/client.mjs 会启动已有服务器，调用原 echo、读取原资源和 Prompt，再调用 intent_parse。`--fixture` 为明确标注的受控候选模式；省略它使用服务器环境中的实际模型配置。

## host 模式

客户端等待 prepare 结束，按 task.instructions/payload/format 生成完整 candidateText，然后提交实际 jobId/stepToken。下一步仍为 task 时继续处理 data 或 repair；只有 result 才完成。refusal/incomplete 通过 cancel 表达，接受候选不代表批准业务执行。

完整运行：examples/mcp/host/client.mjs；`--fixture --repair` 演示一次受控错误和修复。真实 Codex 宿主自己生成候选，示例脚本的显式 API 驱动仅用于模拟宿主。工具注册不自动拦截所有用户消息。

## SDK v2 与实际 vextjs

拆分 SDK 的公开注册胶水在 examples/mcp/sdk-v2/registration.mjs，使用 server 的 fromJsonSchema，回调取消信号来自 ctx.mcpReq.signal。传入原工具名列表，检查冲突后注册；不要求接入方改用 SDK v1。

实际消费固定于 vextjs 2.0.0 源码提交 2458a718179d58e8fabc6e5577f58e4da6be6f1e，server 2.0.0/client 2.3.1。真实 createVextMcpServer 的 7 个工具、11 个资源、4 个 Prompt 与两模式工具共存且可调用。vextjs 自身要求 Node ^20.19.0 或 >=22.12.0，本库仍为 >=20.0.0。

这是源码级开发消费验证。vextjs 没有公开 npm MCP 工厂出口；不推荐不存在的 vextjs/mcp 路径，也不声称已发布的 vextjs 产品自动接入。框架维护者在实际注册位置使用上述公共 Adapter；[验证说明](../testing/validation.md)保留版本与源码身份。

## 命名、会话和错误

前缀原样拼接，冲突时拒绝注册并保留原工具。每个逻辑客户端会话只创建一次 adapter.connect，不按每个请求重建，也不跨客户端共用同一 session。

session.close 清理所属任务，adapter.close 清理自己的会话；调用方负责其实例和服务器。HTTP 临时断流不触发逻辑 session 关闭，本轮 HTTP 宿主例子为 P1。

错误按 isError 和 JSON 文本读取，保留 code/stage/issues/partialResult；成功-only outputSchema 不覆盖错误时，不能返回不匹配的结构化错误。完整规则、方法和关闭后行为见 [MCP Adapter API](../api/mcp-adapter.md)。
