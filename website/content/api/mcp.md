# MCP 工具与协议参考

本页供接入后查询 adapter、工具参数、宿主交接、错误信封和协议边界。第一次连接看[stdio / HTTP教程](/integrations/mcp)；已有服务挂载看[最小接入与完整示例](/integrations/mcp-sdk)。

独立服务配置的instances是IntentConfig；adapter配置的instances是调用方创建的Intent，两者不能互换。所有入口共用相同识别核心和IntentResult。

## Adapter API

```ts
createIntentMcpAdapter(config: IntentMcpAdapterConfig): IntentMcpAdapter
adapter.tools: readonly IntentMcpToolDefinition[]
adapter.connect(options: IntentMcpConnectOptions): IntentMcpSession
adapter.close(): Promise<void>
session.callTool(name: string, args: unknown, options?: IntentParseOptions): Promise<IntentMcpToolResult | undefined>
session.close(): Promise<void>
```

| 参数 | 类型 / 默认 | 行为 |
|---|---|---|
| config.mode | executor或host / executor | executor要求每实例已有执行器 |
| config.instances | Record&lt;string, Intent&gt; / 必填 | 非空、调用方创建的实例；不是独立服务的配置对象 |
| config.toolPrefix | string / 空 | 避免覆盖原工具；注册前检查同名冲突 |
| connect.protocolVersion | 声明版本 / 必填 | 由SDK协商结果提供，不能取自input/context |
| callTool.args.instance | string / 单实例自动选择 | 多实例必须明确指定；不猜default |
| callTool.options.signal | AbortSignal / 可省略 | 协议层取消，不放进工具JSON |

实例名为1～64字符 `[A-Za-z0-9_.-]`，禁止__proto__/prototype/constructor；前缀同字符集，可空。非法连接配置报CONFIG_INVALID/transport。已dispose实例不可用于新的识别。

未知tool精确返回undefined，交原路由。session.close结束所属识别和保留记录；adapter.close关闭自有sessions。二者不dispose调用方Intent，不关闭外部SDK、transport或共享模型。逻辑连接结束时再close，不为host的每个工具调用重建session；多客户端/租户不要共用一个session。

## 宿主交接

| 工具 | 输入 | 成功返回 |
|---|---|---|
| intent_prepare | Native请求加可选instance | HostTask：kind=model_task、requestId、submissionToken、instructions、input、outputSchema |
| intent_accept | requestId、submissionToken、完整candidateText字符串 | IntentResult |
| intent_cancel | requestId，可选reason=cancelled/refusal/incomplete | requestId、status=cancelled/already_cancelled/already_completed |

当前模型按HostTask材料和outputSchema生成候选，不按最终Result猜格式。服务端不另调模型。随包Skill对可纠正格式错误按明确反馈最多纠正一次；信息缺失或字段无法判断不触发格式纠正。无法完成时cancel，拒绝/截断分别用refusal/incomplete。

相同token和逐字相同候选并发共享校验；完成回复仍保留时可重放。不同候选冲突。显式纠正不重置校验预算。默认无识别期限；显式timeout从prepare开始。终态回复每adapter最多32项/8MiB，session关闭、进程重启或记录回收后需重新prepare。这些记录不替应用持久保存需求或对话。

## intent_parse

executor模式只暴露intent_parse。输入为Native的input、fields、context、baseline、referenceTime、output，加instance。默认值和错误见[Native参考](/api/intent)。schema、executor、apiKey、signal、配置路径与mode不能由MCP调用者传入。

单实例 main 可以省略 instance。完成 SDK 协商后，标准 tools/call 请求例如：

<!-- json: executor-request -->
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "intent_parse",
    "arguments": {
      "input": "查询订单000123，不要取消订单"
    }
  }
}
```

本例没有 Schema，因此不附 orderId 字段选择；成功的 structuredContent 是<a href="/intent-runtime/examples/basic-example.json" download target="_blank" rel="noopener noreferrer">无 Schema 完整结果</a>对应的 IntentResult 结构，content[0].text 是同一对象的 JSON 字符串，isError=false。这不是另一套精简响应。需要参数时先在可信实例配置添加 Schema，再从请求选择字段。

host的三个工具请求/回复见[宿主交接](#宿主交接)，完整类型见[类型参考](/api/types)。

## 成功与错误信封

| 场景 | isError | structuredContent | content文本 |
|---|---|---|---|
| 完整/partial意图、缺字段、歧义 | false | IntentResult | 同一JSON |
| host prepare | false | HostTask | 同一JSON |
| host cancel | false | HostCancelReply | 同一JSON |
| 技术失败 | true | 省略 | `{error: SerializedIntentError}`的JSON字符串 |

技术错误不返回partialResult。未知标准方法/不合法JSON-RPC由SDK按协议处理，不伪造IntentResult。

## 协议与远程调用

支持目标为2025-06-18、2025-11-25、2026-07-28；前两版成功信封为content/structuredContent/isError，2026工具回复额外含resultType=complete。协商、discover和请求信封由匹配的SDK处理，不靠改工具参数选择协议。

独立命令支持 `--transport http --host 127.0.0.1 --port 3001 --path /mcp`，使用有状态 Streamable HTTP 的2025-06-18 / 2025-11-25协议；stdio支持上面三个版本。HTTP启动选项、客户端URL和会话限额见[教程](/integrations/mcp#使用-http-与指定端口)。

`--public-origin` 显式配置公开 HTTP/HTTPS 源地址，独立于监听地址；必须不含凭据、通配域名、路径、query 或 fragment。绑定0.0.0.0/::时必填。公开 Host 与 Origin 精确匹配配置，本机诊断地址另保留；不信任任意转发头。TLS代理步骤及非默认端口规则见[远程部署](/integrations/mcp#远程地址与-https-代理)。

已有服务也可将相同工具列表/调用转接挂到原HTTP SDK处理器。认证、监听和断线恢复属于该服务；逻辑session存续时，短暂HTTP断流不等于close。不要给每次HTTP请求创建新的host session，否则prepare/accept无法衔接。HTTP部署仍需验证实际客户端、代理与认证配置。

## 完整 executor 回复

以下是 tools/call 的 result 内容，不含外层 jsonrpc/id。由实际 Adapter 与核心生成固定样例，语言候选受控；不是任意真实模型的逐字输出。

<a href="/intent-runtime/examples/executor-request.json" download target="_blank" rel="noopener noreferrer">下载标准请求</a> · <a href="/intent-runtime/examples/executor-result.json" download target="_blank" rel="noopener noreferrer">下载完整工具回复</a>

<details>
<summary>展开完整工具回复</summary>

<!-- json: executor-result -->
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"schemaVersion\":\"2.0-draft.6\",\"input\":\"查询订单000123，不要取消订单\",\"status\":\"complete\",\"turn\":{\"kind\":\"request\",\"normalizedInput\":\"查询订单000123，不要取消订单\",\"intentIds\":[\"intent-1\"],\"changes\":[{\"operation\":\"add\",\"target\":{\"kind\":\"intent\",\"id\":\"intent-1\"},\"description\":\"新增本轮明确请求\",\"sourceRefs\":[{\"root\":\"input\",\"pointer\":\"\"}],\"effect\":\"applied\"},{\"operation\":\"add\",\"target\":{\"kind\":\"constraint\",\"id\":\"constraint-1\"},\"description\":\"新增本轮明确请求\",\"sourceRefs\":[{\"root\":\"input\",\"pointer\":\"\"}],\"effect\":\"applied\"}],\"facts\":{}},\"effective\":{\"schemaVersion\":\"2.0-draft.6\",\"coverage\":\"complete\",\"scope\":\"current_request\",\"intents\":[{\"id\":\"intent-1\",\"domain\":null,\"action\":\"查询\",\"target\":\"订单000123\",\"goal\":\"查询订单000123\",\"understanding\":\"clear\",\"constraints\":[{\"id\":\"constraint-1\",\"kind\":\"prohibition\",\"text\":\"不要取消订单\",\"scope\":{\"type\":\"intent\",\"intentId\":\"intent-1\"}}],\"inputs\":{},\"references\":[],\"children\":[],\"extensions\":{}}],\"constraints\":[],\"relations\":[],\"unresolved\":[]},\"fieldResults\":[],\"issues\":[],\"inferences\":[]}"
    }
  ],
  "structuredContent": {
    "schemaVersion": "2.0-draft.6",
    "input": "查询订单000123，不要取消订单",
    "status": "complete",
    "turn": {
      "kind": "request",
      "normalizedInput": "查询订单000123，不要取消订单",
      "intentIds": [
        "intent-1"
      ],
      "changes": [
        {
          "operation": "add",
          "target": {
            "kind": "intent",
            "id": "intent-1"
          },
          "description": "新增本轮明确请求",
          "sourceRefs": [
            {
              "root": "input",
              "pointer": ""
            }
          ],
          "effect": "applied"
        },
        {
          "operation": "add",
          "target": {
            "kind": "constraint",
            "id": "constraint-1"
          },
          "description": "新增本轮明确请求",
          "sourceRefs": [
            {
              "root": "input",
              "pointer": ""
            }
          ],
          "effect": "applied"
        }
      ],
      "facts": {}
    },
    "effective": {
      "schemaVersion": "2.0-draft.6",
      "coverage": "complete",
      "scope": "current_request",
      "intents": [
        {
          "id": "intent-1",
          "domain": null,
          "action": "查询",
          "target": "订单000123",
          "goal": "查询订单000123",
          "understanding": "clear",
          "constraints": [
            {
              "id": "constraint-1",
              "kind": "prohibition",
              "text": "不要取消订单",
              "scope": {
                "type": "intent",
                "intentId": "intent-1"
              }
            }
          ],
          "inputs": {},
          "references": [],
          "children": [],
          "extensions": {}
        }
      ],
      "constraints": [],
      "relations": [],
      "unresolved": []
    },
    "fieldResults": [],
    "issues": [],
    "inferences": []
  },
  "isError": false
}
```

</details>
