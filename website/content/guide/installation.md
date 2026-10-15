# 安装、版本与 Codex 维护

本文对应V2，包版本为2.0.0-dev.0，结果/baseline版本为2.0-draft.6。截至2026-10-15，npm latest为1.0.2，V2尚未发行；目前使用下面的源码构建路径。V2正式发行后，可安装对应的明确版本。

| 你的目标 | 按此顺序操作 |
|---|---|
| 在应用里调用 | 获取 V2 tgz → 安装到 Node.js 项目 → 快速开始 |
| 在 Codex 中使用当前模型 | 获取 V2 tgz → 保存 host 配置 → 全局安装与 setup → 重载并调用 |
| 加到已有 MCP | 获取 V2 tgz → 项目安装 → 按已有 MCP 接入 |
| 独立提供 MCP tools | 获取 V2 tgz → 准备配置 → 运行 stdio 命令；不必登记 Codex |

只选择需要的一条路径；源码打包是获取当前 V2 包的准备步骤，不是每次调用都要执行。

## 获取当前 V2 包

需要Git、Node.js≥20.0.0、npm及npm registry访问权限。在你选择的工作目录执行；以下提交是本文示例所需的V2运行时基线：

```bash
git clone https://github.com/devcodex-labs/intent-runtime.git intent-runtime-source
cd intent-runtime-source
git checkout --detach f36f11163c4cbe7ea492fd4673a6c81197a0d0aa
npm ci --ignore-scripts
npm pack --pack-destination ..
cd ..
```

得到devcodex-intent-runtime-2.0.0-dev.0.tgz。保留它的绝对路径，供项目安装或全局安装使用；这两个方式按需选择，不必都做。

## 安装到 Node.js 项目

在新建或已有应用目录执行，将路径换成刚才的tgz：

```bash
npm init -y
npm install /absolute/path/devcodex-intent-runtime-2.0.0-dev.0.tgz schema-dsl@3.0.4
node --input-type=module -e "import {Intent} from '@devcodex/intent-runtime'; console.log(typeof Intent)"
```

已有package.json时省略npm init。最后一条应输出function，说明V2入口可导入；它不会调用模型。继续[快速开始](/guide/quick-start)配置真实模型并运行parse.mjs。运行文件用.mjs，或将应用package.json设为type=module。

## 全局安装与登记 Codex

先按[Codex页](/integrations/codex)保存配置文件。安装模块不会修改宿主配置，全局使用时显式登记：

```bash
npm install -g /absolute/path/devcodex-intent-runtime-2.0.0-dev.0.tgz
intent-runtime setup --host codex --config /absolute/path/intent.host.config.mjs
```

Windows可用 `D:\Worker\文件名.tgz`，给含空格的路径加引号；macOS/Linux使用真实绝对路径。两行命令在你准备好tgz和可信配置后执行。

可信 `.mjs` 配置是普通 Node.js 代码，启动诊断会执行其初始化。host 配置不需要额外 API Key，见 [Codex 接入](/integrations/codex)。

先按Codex页保存完整配置，再替换上面的绝对路径。全局配置推荐无包导入的JSON Schema；若配置使用Builder/API适配器导入，应放在安装了相应本地依赖的项目中。示例文件不随npm包安装，可从文档直接复制。

```bash
intent-runtime doctor --host codex
intent-runtime doctor --host codex --repair
intent-runtime clean --host codex
```

| 参数 | 规则 |
|---|---|
| `--host` | 必填，只支持 `codex` |
| `--config` | setup 必填的现有绝对 `.mjs` 路径；其他维护命令禁止 |
| `--name` | 默认 intent-runtime；1～64 字符 `[A-Za-z0-9_.-]`，不得使用 `__proto__`、`prototype`、`constructor` |
| `--dry-run` | setup/clean/doctor --repair 可用；不写文件、不导入配置、不启动进程 |
| `--json` | 输出一个 MaintenanceReport JSON 对象 |
| `--help` / `--version` | 独立使用，不加载配置或启动服务 |

`INTENT_RUNTIME_HOME` 为显式绝对状态目录，默认用户 `.intent-runtime`；`CODEX_HOME/config.toml` 为 Codex 配置，默认用户 `.codex/config.toml`；Skill 安装到用户 `.agents/skills/<name>/SKILL.md`。这些路径来自本地用户环境，不能由 MCP 参数替换。

setup 幂等，仅编辑对应表。doctor 默认只读，通过实际 stdio 列工具，不调用模型。repair 只恢复仍有拥有权记录的缺项。用户编辑、同名其他工具、未知符号链接和不安全 TOML 布局会触发保护冲突。clean 不删除用户业务配置、环境变量或其他工具。

报告始终含 `command/status/changed/checks/paths/warnings`。status 为 ok/planned/conflict/failed；changed 只反映实际写入。退出码：0 成功或计划，1 操作/启动失败，2 参数/配置无效，3 保护冲突或诊断不健康。事务逐文件提交，失败回滚仍属于本次写入的内容；并发用户编辑会被保留。中断恢复不使用时间过期或强制覆盖。

## 更新

显式安装你选定的新包版本后，按需重跑setup或doctor --repair，再重载客户端。更新不自动下载业务配置，也不覆盖用户改动。clean仅移除本模块拥有的登记/Skill，不删除你的配置文件或业务数据。
