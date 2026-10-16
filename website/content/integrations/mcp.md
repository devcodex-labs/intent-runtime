# MCP 接入与使用

<a id="接入-mcp-与已有-tools"></a>

| 用法 | 你提供什么 | 谁管理连接 |
|---|---|---|
| 独立stdio | 可信.mjs配置 | intent-runtime-mcp |
| 已有MCP服务 | Intent实例、adapter、SDK处理器 | 你的SDK服务 |
| 远程Streamable HTTP | 将同一adapter挂到已有HTTP MCP | 你的服务管理监听、认证和逻辑session |

模型来源另行选择：executor模式暴露intent_parse；host模式暴露prepare/accept/cancel，由当前宿主生成候选。工具注册不会自动获取模型或拦截所有消息。

## 独立 stdio 服务

先按[安装与版本](/guide/installation)完成全局安装。此路径直接启动 stdio，无需先接入 Codex。将下面 host 配置保存为 intent.host.config.mjs，记录真实绝对路径：

<!-- example: examples/codex/intent.host.config.mjs -->
```js
export default {
  mode: 'host',
  instances: {orders: {language: 'zh-CN', schema: {
    type: 'object',
    properties: {orderId: {type: 'string', description: '用户明确提供的订单编号，保留前导零；仅适用于订单意图'}},
  }}},
};
```

配置是可信 Node.js 模块；无包导入，可以独立保存。由你的 MCP 客户端启动以下命令：

```bash
intent-runtime-mcp --config /absolute/path/intent.host.config.mjs
```

这是独立服务，不需要运行setup登记Codex。客户端配置选STDIO，command为intent-runtime-mcp的实际可执行路径，args为["--config", "配置文件绝对路径"]。Windows按客户端支持使用.cmd入口或绝对命令路径；路径含空格时作为单个参数传入。stdout仅传协议，请用客户端查看工具和stderr诊断。

| 独立配置 | 类型 / 默认 | 规则 |
|---|---|---|
| mode | executor或host / executor | 可信服务配置，不由工具参数切换 |
| instances | Record&lt;string, IntentConfig&gt; / 必填 | 非空配置映射；CLI创建并拥有Intent |
| toolPrefix | string / 空 | 加在所有工具名前；最终名称≤128字符 |

executor实例要配置[模型执行器](/integrations/api)，host无需executor。支持--help/--version；无效参数退出2，加载/启动失败退出1，正常EOF或SIGINT/SIGTERM退出0。stdout仅传MCP，日志用stderr。

### 使用所配 API 的完整配置

与 host 配置二选一。以下文件要保存在已安装 Intent Runtime 的项目内，设置 INTENT_API_KEY 和 INTENT_MODEL 后，使用该文件的绝对路径启动。它默认不选业务字段，只识别目标与约束。

<!-- example: examples/mcp/intent.executor.config.mjs -->
```js
import {createApiExecutor} from '@devcodex/intent-runtime/adapters/api';
const apiKey = process.env.INTENT_API_KEY, model = process.env.INTENT_MODEL;
if (!apiKey || !model) throw new Error('Set INTENT_API_KEY and INTENT_MODEL.');
export default {mode: 'executor', instances: {main: {language: 'zh-CN', executor: createApiExecutor({provider: 'openai', apiKey, model})}}};
```


## 完成第一次识别

host模式应列出intent_prepare、intent_accept、intent_cancel：先用instance=orders、fields=["orderId"]和原始input“查询订单000123，不取消订单”prepare，由当前宿主模型按返回的instructions/input/outputSchema生成候选，再accept。只有accept的IntentResult是最终结果；无法完成时cancel。

executor模式应列出intent_parse：传入input“查询订单000123，不取消订单”，无Schema时不选字段。structuredContent中的结果应保留查询目标和禁止事项，随后按[读取结果](/guide/results)消费。host不额外调用API，executor使用服务所配模型。

| 现象 | 下一步 |
|---|---|
| 启动失败/没有工具 | 核对绝对.mjs路径、配置导入依赖、可选SDK是否安装及客户端stderr |
| 列出的工具与预期不符 | 核对mode并重启客户端连接 |
| 有prepare但没有最终结果 | 完成同一session的accept，候选格式按outputSchema；不能把HostTask当结果 |
| 返回isError=true | 读取error摘要并按[错误恢复](/api/errors)处理 |

## 添加到已有 MCP tools

保留原SDK、transport、tools/resources/prompts，在已有服务中挂载adapter。直接使用[完整SDK Server示例](/integrations/mcp-sdk)，不要为每次host工具调用新建session。远程HTTP由你的已有服务管理认证与逻辑连接。

## Adapter API

方法、参数和资源所有权见[Adapter参考](/api/mcp#adapter-api)。

## intent_parse

完整工具请求与返回见[intent_parse参考](/api/mcp#intent_parse)。

## 成功与错误信封

成功结果与技术失败的不同外层结构见[信封参考](/api/mcp#成功与错误信封)。

## 协议与远程调用

版本、协商、会话与远程边界见[协议参考](/api/mcp#协议与远程调用)。独立命令仅提供stdio，不提供HTTP监听。

## 完整 executor 回复

完整JSON与下载保留在[工具回复](/api/mcp#完整-executor-回复)。
