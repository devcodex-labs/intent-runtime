# 标准 MCP 与已有 tools

```js
import {createIntentMcpAdapter} from '@devcodex/intent-runtime/mcp';
const adapter = createIntentMcpAdapter({mode: 'executor', instances: {orders: intent}, toolPrefix: 'orders_'});
const session = adapter.connect({protocolVersion: verifiedProtocolVersion});
const tools = adapter.tools;
const result = await session.callTool(name, args, {signal});
```

公开 adapter 不绑定端口、不依赖 SDK 类型。现有 SDK 负责协议协商、JSON-RPC 和传输；verifiedProtocolVersion 必须来自协议层，不能来自用户 input/context。目标版本为 2025-06-18、2025-11-25、2026-07-28。

executor 只暴露 intent_parse，参数为 Native request 加可选 instance。单实例省略 instance 选唯一实例，多实例必须明确选择。配置名为 1～64 字符 `[A-Za-z0-9_.-]`，前缀加工具名最长 128 字符。MCP 参数不能携带 schema、模式、executor、apiKey、signal 或配置路径。

注册前检查同名冲突。tools/list 合并原工具与 adapter.tools；tools/call 先调用 session.callTool，返回 undefined 时交原路由。原资源、Prompt、图片等结果保持原路由，见仓库 `examples/mcp/attach.mjs`。持续复用每条逻辑客户端 session，不能为 host 的每个调用重建会话。

正常回复 isError=false，structuredContent 是完整业务结果，content 文本是同一 JSON。技术错误 isError=true，省略 structuredContent。2026 回复含 resultType=complete；2025 不含。新协议须使用 SDK 的 discover/每请求信封机制，不能只给旧协议加字段冒充支持。

session.close 停止所属工作；adapter.close 关闭所属 sessions。二者不 dispose 调用方 Intent、不关闭外部 SDK/transport。
