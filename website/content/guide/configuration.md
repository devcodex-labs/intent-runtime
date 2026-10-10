---
title: 配置与多实例
description: 用户级 MCP 与业务配置的路径、命名实例、工作目录、语言和 Schema 设置。
---

# 配置与多实例

自动安装分开维护客户端注册与业务定义。客户端注册告诉 Codex 如何启动 MCP；业务配置决定有哪些 instance、使用什么语言和 Schema。

## 默认路径

| 用途 | 路径 |
| --- | --- |
| Codex 用户级注册 | `~/.codex/config.toml`；设置 `CODEX_HOME` 时为该目录下的 `config.toml` |
| 新建业务配置 | `~/.intent-runtime/intent.config.mjs` |
| Skill | `~/.agents/skills/<实际 Skill 名>/SKILL.md` |
| 安装状态 | `~/.intent-runtime/state.json` |
| 安装日志 | `~/.intent-runtime/logs/installation.jsonl` |
| 配置备份与恢复记录 | `~/.intent-runtime/` 下的管理文件 |

Windows 的 `~` 通常对应当前用户目录。发生名称冲突时，注册或 Skill 可能使用带后缀的名称，以安装状态和 `doctor` 输出为准。迁移已有配置时，实际业务配置路径可能不同于默认路径。

## 定义中文订单实例

编辑实际业务配置：

```js
import { s } from "schema-dsl/pure";

export default {
  instances: {
    default: { language: "zh-CN" },
    orders: {
      language: "zh-CN",
      schema: s({
        orderId: s("string!").description("当前有效请求中的订单编号。原样保留前导零，不猜测。"),
      }),
    },
  },
};
```

MCP 启动时读取这份配置。修改后重载客户端，识别订单时提交 `instance: "orders"`。`fields: ["orderId"]` 提取该字段；`fields: []` 只识别默认意图。

:::tip 配置文件的依赖解析
Node 从 `.mjs` 所在目录向上解析依赖。用户目录中的配置不能假设能直接导入全局包内部的 `schema-dsl`。上面的 import 适合放在已安装 `schema-dsl` 的业务项目中；也可以在用户配置里直接写 JSON Schema，并让 MCP 的 `--config` 指向你确定可加载的路径。
:::

没有本地依赖时，同样的字段可写为：

```js
export default {
  instances: {
    orders: {
      language: "zh-CN",
      schema: {
        type: "object",
        properties: {
          orderId: { type: "string", description: "当前有效请求中的订单编号，原样保留前导零，不猜测。" },
        },
        required: ["orderId"],
        additionalProperties: false,
      },
    },
  },
};
```

## 工作目录与环境

MCP 的 `cwd` 是启动进程的工作目录。代码中的相对文件读取依赖它；业务配置的 `import` 相对路径仍按配置文件位置解析。迁移已有注册时保留原 `cwd`，新配置默认使用配置文件所在目录。

配置运行于 Node.js，有读文件和执行代码的能力，只加载你信任的文件。MCP 标准输出用于协议消息，配置或业务依赖的日志应写入标准错误。

项目级 `.codex/config.toml` 和 Codex profile 可能影响最终采用的注册，`doctor` 会提示检测到的覆盖关系。用户级诊断健康之后，仍要在目标客户端核对其实际配置。

`language` 默认 `en`，接受模块随包发布的 IANA 快照中认可的 BCP 47 标签，如 `zh-CN`。它控制结构化说明语言；精确业务值仍按原始材料保留。
