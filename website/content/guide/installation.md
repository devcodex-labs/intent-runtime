# 安装与版本

<a id="安装版本与-codex-维护"></a>

在应用中使用需要 **Node.js ≥20、npm 和 ESM**。保存为 `.mjs` 即可使用 ESM；现有应用也可在 package.json 设置 `type: module`。不需要安装文档站的构建工具。

<a id="先确认安装版本"></a>

## 选择安装方式

本文档适用于 **Intent Runtime V2**。按使用场景选择安装位置：

| 你的目标 | 安装位置 | 安装后的下一步 |
|---|---|---|
| 在 Node.js 应用里调用 | 应用项目 | [快速开始](/guide/quick-start)，先识别目标和约束 |
| 在 Codex 中使用当前模型 | 全局命令 | [保存配置、登记、重载并识别](/integrations/codex) |
| 给已有 MCP 添加工具 | 现有服务项目 | [完整 SDK Server 示例](/integrations/mcp-sdk) |
| 启动独立 MCP 服务 | 全局命令或服务项目 | [配置 stdio 服务](/integrations/mcp) |

<a id="获取当前-v2-包"></a>

## 安装到 Node.js 项目

在应用目录执行：

```bash
npm install @devcodex/intent-runtime
```

npm 会自动安装所需依赖，包括 `schema-dsl`，无需另行安装。使用 Node.js 20 及以上随附的 npm 即可。

安装后可以检查依赖并确认导出可加载：

```bash
npm ls @devcodex/intent-runtime schema-dsl
node --input-type=module -e "import {Intent} from '@devcodex/intent-runtime'; console.log(typeof Intent)"
```

最后一条应输出 `function`，只验证导出可加载，不调用模型。接下来保存并运行[快速开始的 basic.mjs](/guide/quick-start)。

## 全局安装与登记 Codex

需要在 Codex 中使用，或直接启动独立 stdio 服务时，安装全局命令：

```bash
npm install -g @devcodex/intent-runtime
intent-runtime --version
intent-runtime-mcp --version
```

全局安装不修改宿主配置。继续[Codex 接入](/integrations/codex)保存配置并显式 setup；host 使用当前模型，不需要额外 API Key。独立 stdio 服务不必登记 Codex。

MCP stdio 与 Codex 的启动/诊断需要包的可选 MCP SDK 依赖；使用 `--omit=optional` 安装时不包含这条启动能力。Native/API 及 SDK 无关的 adapter 入口有独立验证范围，见[兼容与支持](/testing/validation)。

全局安装不会使任意 `.mjs` 都能导入全局包。无导入的 JSON Schema 配置可独立保存；使用 Builder 或 API adapter 的配置应放在装有相应本地依赖的项目中。示例源码不随 npm 包分发，可直接从对应页面复制。

## 更新

在应用目录重新执行 `npm install @devcodex/intent-runtime`；全局命令使用 `npm install -g @devcodex/intent-runtime`。更新内容见[更新日志](https://github.com/devcodex-labs/intent-runtime/blob/main/CHANGELOG.md)。Codex 的检查、修复、清理、命令选项与退出码见[安装维护](/operations/codex)。本模块不会自动下载或覆盖你的业务配置。
