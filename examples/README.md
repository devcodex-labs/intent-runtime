# 接入示例

按[安装与版本](https://devcodex-labs.github.io/intent-runtime/guide/installation.html)获取V2包，使用Node.js≥20.0.0与ESM。页面提供可复制的完整文件；这些仓库示例不随npm包一同安装。

| 文件 | 用途 | 前置条件 |
|---|---|---|
| api/basic.mjs | 无Schema的基础目标与约束识别 | 项目安装运行库，环境INTENT_API_KEY/INTENT_MODEL |
| api/multi-turn.mjs | 完整VIP Schema与三轮失效/修正 | 项目安装运行库，环境INTENT_API_KEY/INTENT_MODEL |
| api/parse.mjs | API识别与所属字段消费 | 项目安装运行库/schema-dsl，环境INTENT_API_KEY/INTENT_MODEL |
| custom-executor.ts | 自有模型网关适配 | ESM TypeScript项目，网关符合示例请求/回复协议 |
| codex/intent.host.config.mjs | Codex全局host配置 | 无包导入，任意可信可访问目录；当前宿主生成候选 |
| mcp/intent.executor.config.mjs | 独立API执行器MCP配置 | 配置文件所在项目可解析运行库，环境凭据与模型 |
| mcp/attach.mjs + mcp/server.mjs | 在真实SDK中合并原工具、资源、Prompt与意图工具 | 项目安装@modelcontextprotocol/server@2.3.1；host无额外API Key |

全局安装后显式 `intent-runtime setup --host codex --config <现有绝对路径.mjs>`。普通安装不改宿主。使用Builder或API适配器导入的配置要位于可解析本地依赖的项目；全局npm目录不会成为任意配置文件的ESM依赖目录。

独立服务：`intent-runtime-mcp --config <绝对路径.mjs>`。已有SDK示例：同目录保存attach.mjs和server.mjs后运行 `node server.mjs`。stdout只传MCP，日志写stderr。

TypeScript例子在有type=module的项目编译，INTENT_GATEWAY_URL/INTENT_MODEL/INTENT_API_KEY通过环境提供。类型检查只证明接口使用，不证明你的网关已经接受候选Schema或具有语义准确性。
