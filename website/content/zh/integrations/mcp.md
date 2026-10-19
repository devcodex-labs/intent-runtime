# MCP 接入与使用

<a id="接入-mcp-与已有-tools"></a>

先决定两件独立的事：**谁调用模型**，以及**客户端怎样连接服务**。

| 模型来源 | 适用情况 | 提供的工具 |
|---|---|---|
| host：当前客户端模型 | 希望复用宿主模型，不配置另一套 Key | intent_runtime_prepare / intent_runtime_accept / intent_runtime_cancel |
| executor：服务所配模型 | 服务端已有模型 API / 网关 | intent_runtime_parse |

| 连接方式 | 你提供什么 | 谁管理连接 |
|---|---|---|
| 独立 stdio | 可信 .js / .mjs 配置 | 客户端启动 intent-runtime-mcp 子进程 |
| 独立 HTTP | 同一配置，监听地址和端口 | 启动服务后，客户端连接 /mcp URL |
| 已有MCP服务 | Intent实例、adapter、SDK处理器 | 你的SDK服务 |

host / executor 都可以通过 stdio 或 HTTP 使用。先按下面的 host 配置接通，再按需改成所配 API；工具注册不会自动拦截所有聊天消息。

## 独立 stdio 服务

先按[安装与版本](/zh/guide/installation)完成安装。此路径无需先接入 Codex。在已有 ESM 项目中保存为 `intent.host.config.js`；独立文件可保存为 `.mjs`，两种内容相同。记录真实绝对路径：

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

配置是可信 Node.js 模块；无包导入，可以独立保存。按安装位置选择启动命令。

**全局安装：** 在终端检查或由 MCP 客户端启动以下命令：

```bash
intent-runtime-mcp --config /absolute/path/intent.host.config.js
```

**项目本地安装：** 在已执行 `npm install @devcodex/intent-runtime` 的服务项目目录运行；下面使用独立的 `.mjs` 配置文件：

```bash
npx --no-install intent-runtime-mcp --config /absolute/path/my-service/intent.host.config.mjs
```

本地安装不会把命令加入系统 PATH。先确认项目已安装该包；`--no-install` 阻止为本次命令临时安装缺失包，仍需从正确的服务项目目录运行。

在 MCP 客户端中选择 STDIO。**全局安装**且客户端 PATH 可找到命令时，支持 mcpServers 格式的客户端可参考：

```json
{
  "mcpServers": {
    "intent-runtime": {
      "command": "intent-runtime-mcp",
      "args": ["--config", "/absolute/path/intent.host.config.js"]
    }
  }
}
```

**项目本地安装**可使用 Node 和已安装入口的绝对路径，不依赖客户端的工作目录或 npm 命令 PATH：

```json
{
  "mcpServers": {
    "intent-runtime": {
      "command": "/absolute/path/to/node",
      "args": [
        "/absolute/path/my-service/node_modules/@devcodex/intent-runtime/dist/cli/mcp.js",
        "--config",
        "/absolute/path/my-service/intent.host.config.mjs"
      ]
    }
  }
}
```

用 `node -p "process.execPath"` 查 Node 路径，将所有占位路径替换为真实绝对路径；配置表单中每个 args 项单独填写。Windows 可使用 `C:/Program Files/nodejs/node.exe` 和 `D:/Worker/my-service/...` 这样的路径；JSON 中使用 `/` 或转义后的 `\\`。JSON 字符串中的路径即使含空格也无需再加 shell 引号。

全局命令找不到时同样可填可执行文件绝对路径。Windows按客户端支持使用.cmd入口；不支持时使用上述 node 加安装入口的方式。Codex 用户可直接用[setup登记](/zh/integrations/codex)。stdout 只传协议，日志在客户端 stderr 中查看。

| 独立配置 | 类型 / 默认 | 规则 |
|---|---|---|
| mode | executor或host / executor | 可信服务配置，不由工具参数切换 |
| instances | Record&lt;string, IntentConfig&gt; / 必填 | 非空配置映射；CLI创建并拥有Intent |
| toolPrefix | string / 空 | 可省略；加在完整的 intent_runtime_* 名称前，例如 orders_intent_runtime_prepare；最终名称≤128字符 |

executor实例要配置[模型执行器](/zh/integrations/api)，host无需executor。支持--help/--version；无效参数退出2，加载/启动失败退出1，正常EOF或SIGINT/SIGTERM退出0。stdout仅传MCP，日志用stderr。

## 使用 HTTP 与指定端口

复用上面的配置，在终端中启动。全局安装使用：

```bash
intent-runtime-mcp --config /absolute/path/intent.host.config.js --transport http --host 127.0.0.1 --port 3001 --path /mcp
```

项目本地安装则在服务项目目录使用：

```bash
npx --no-install intent-runtime-mcp --config /absolute/path/my-service/intent.host.config.mjs --transport http --host 127.0.0.1 --port 3001 --path /mcp
```

后面的远程部署示例使用全局命令；项目本地安装时同样在命令前加 `npx --no-install`，并在服务项目目录运行。

终端应显示 `Intent MCP listening at http://127.0.0.1:3001/mcp`。保持进程运行，在客户端新增 Streamable HTTP 连接：

```json
{
  "mcpServers": {
    "intent-runtime": {
      "url": "http://127.0.0.1:3001/mcp"
    }
  }
}
```

客户端不支持该 JSON 格式时，在其 MCP 配置表单填写相同 URL。连接后应出现三个 host 工具；端口被占用时换一个端口，并同步客户端 URL。结束后 Ctrl+C 停止服务。

| 命令选项 | 默认值 | 用途 |
|---|---|---|
| --config | 必填 | 可信 .js / .mjs 的绝对路径 |
| --transport | stdio | stdio 或 http |
| --host | 127.0.0.1 | HTTP 监听地址 |
| --port | 3001 | HTTP 端口，1—65535 |
| --path | /mcp | HTTP 路径，例如 /mcp；不含 query |
| --public-origin | 不设置 | 公开 HTTP/HTTPS 源地址，含需要的端口，不含路径、凭据、query 或 fragment |

host、port、path、public-origin 属于启动选项，不写进 Intent 配置。stdio 不接受这些 HTTP 选项。HTTP 使用 MCP SDK 的有状态 Streamable HTTP，支持 2025-06-18 / 2025-11-25 协议；stdio 另支持 2026-07-28。客户端需支持相应协议。

同一个客户端要保留协商得到的 `Mcp-Session-Id`，prepare 与 accept 使用同一逻辑会话。HTTP 会话最多128个，30分钟无新请求会回收；请求体上限4 MiB。它不是业务对话持久化。默认只监听本机；部署到其他机器时显式配置监听地址，并由部署层配置认证、HTTPS及访问地址；本命令不提供 OAuth 或代理管理。

### 远程地址与 HTTPS 代理

`--host` 是进程绑定地址；`--public-origin` 是客户端实际访问的源地址。这两者可以不同。绑定 `0.0.0.0` 或 `::` 时必须指定公开源地址，不能把通配地址直接当作客户端 URL。例如在受控局域网中：

```bash
intent-runtime-mcp --config /absolute/path/intent.host.config.js --transport http --host 0.0.0.0 --port 3001 --public-origin http://192.168.1.10:3001
```

将示例 IP 替换为本机真实地址，客户端访问 `http://192.168.1.10:3001/mcp`。它不会自动提供认证或加密；公网部署应在已配置 TLS 与访问控制的代理之后运行。

HTTPS 域名示例：代理对外提供 `https://mcp.example.com/mcp`，进程只在本机监听：

```bash
intent-runtime-mcp --config /absolute/path/intent.host.config.js --transport http --host 127.0.0.1 --port 3001 --public-origin https://mcp.example.com
```

下面是加入**已有 TLS/访问控制 server 块**的 Nginx 路由片段；证书、认证和域名由你的部署配置提供：

```nginx
location = /mcp {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_buffering off;
    proxy_read_timeout 3600s;
}
```

客户端填写 `https://mcp.example.com/mcp`。代理须保留公开 `Host`、原始 `Origin`、MCP 会话/协议头及流式响应；带非默认端口时，公开源地址和 Host 必须包含相同端口。服务不会根据任意 `X-Forwarded-*` 头扩大允许范围，也不能通过改写错误 Origin 来绕过检查。公开 Host 只接受所配源地址的 Host；携带 Origin 时必须与它的 scheme、host、port 一致。本机地址仍可用于本机诊断。

验证部署时，先连接、列工具，再在同一会话完成 prepare/accept；不匹配的 Host/Origin 应返回403。自动化覆盖这些请求边界，实际代理、证书和认证仍需在你的部署环境验证。

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

连接支持工具调用的 AI 客户端后，提出：“请使用 intent-runtime 识别‘查询订单000123，不取消订单’，提取订单号，展示查询目标和禁止事项，不执行订单操作。”

host 模式应列出 intent_runtime_prepare、intent_runtime_accept、intent_runtime_cancel。它需要客户端模型完成交接；只支持列工具的客户端不会自动完成识别。工具参数与调用顺序见[宿主交接](/zh/api/mcp#宿主交接)。Codex 的 setup 会安装对应 Skill。

executor 模式可直接调用：

```json
{
  "name": "intent_runtime_parse",
  "arguments": {"input": "查询订单000123，不取消订单"}
}
```

executor模式应列出intent_runtime_parse：传入input“查询订单000123，不取消订单”，无Schema时不选字段。structuredContent中的结果应保留查询目标和禁止事项，随后按[读取结果](/zh/guide/results)消费。host不额外调用API，executor使用服务所配模型。

| 现象 | 下一步 |
|---|---|
| 启动失败/没有工具 | 核对绝对.js/.mjs路径、ESM项目配置、导入依赖及客户端stderr |
| HTTP无法连接 | 核对监听地址、端口和/mcp路径；确认进程仍在运行 |
| HTTP 403 | 核对公开 URL 与 --public-origin；代理保留公开 Host 和原始 Origin，包含非默认端口 |
| 列出的工具与预期不符 | 核对mode并重启客户端连接 |
| 有prepare但没有最终结果 | 完成同一session的accept，候选格式按outputSchema；不能把HostTask当结果 |
| 返回isError=true | 读取error摘要并按[错误恢复](/zh/api/errors)处理 |

## 添加到已有 MCP tools

保留原 SDK、transport 和工具，从[最小修改步骤](/zh/integrations/mcp-sdk)开始。已有 HTTP MCP 服务也使用同一 adapter；监听端口、认证和客户端逻辑连接继续由原服务管理，不要为每个 HTTP 请求重建 host session。

<a id="adapter-api"></a>
<a id="intent_parse"></a>
<a id="intent_runtime_parse"></a>
<a id="成功与错误信封"></a>
<a id="协议与远程调用"></a>
<a id="完整-executor-回复"></a>

## 参数与协议参考

查阅[Adapter API](/zh/api/mcp#adapter-api)、[工具请求](/zh/api/mcp#intent_runtime_parse)、[成功与错误信封](/zh/api/mcp#成功与错误信封)、[协议与会话](/zh/api/mcp#协议与远程调用)和[完整回复下载](/zh/api/mcp#完整-executor-回复)。
