# Codex 安装维护与排障

首次接入请按[Codex 接入](/zh/integrations/codex)完成配置、登记和第一次识别。本页用于检查已有登记、修复缺项或移除本模块。

## 安装与登记的区别

包安装只提供命令；`setup` 才登记用户级 MCP，并在 host 模式安装识别 Skill。执行前先按[安装](/zh/guide/installation)完成全局安装。配置文件必须是现有、可信的绝对 `.js` / `.mjs` 路径；它是 Node.js 代码，实际启动会执行初始化。`.js` 使用 ESM 项目配置，TS先编译为ESM `.js`。

```bash
intent-runtime setup --host codex --config /absolute/path/intent.host.config.mjs --dry-run
intent-runtime setup --host codex --config /absolute/path/intent.host.config.mjs
```

先预览，再按需要实际登记。Windows 路径含空格时加引号。setup 成功后重载客户端；看到工具只证明登记可用，完整识别还要完成 prepare/accept。

## 检查、修复与移除

```bash
intent-runtime doctor --host codex
intent-runtime doctor --host codex --repair
intent-runtime clean --host codex
```

| 参数 | 规则 |
|---|---|
| `--host` | 必填，只支持 `codex` |
| `--config` | setup 必填的现有绝对 `.js` / `.mjs` 路径；其他维护命令禁止 |
| `--name` | 默认 intent-runtime；1～64 字符 `[A-Za-z0-9_.-]`，不得使用 `__proto__`、`prototype`、`constructor` |
| `--dry-run` | setup/clean/doctor --repair 可用；不写文件、不导入配置、不启动进程 |
| `--json` | 输出一个 MaintenanceReport JSON 对象 |
| `--help` / `--version` | 独立使用，不加载配置或启动服务 |

`INTENT_RUNTIME_HOME` 为显式绝对状态目录，默认用户 `.intent-runtime`；`CODEX_HOME/config.toml` 为 Codex 配置，默认用户 `.codex/config.toml`；Skill 安装到用户 `.agents/skills/<name>/SKILL.md`。这些路径来自本地用户环境，不能由 MCP 参数替换。

setup 幂等，仅编辑对应表。doctor 默认只读，通过实际 stdio 列工具，不调用模型。repair 只恢复仍有拥有权记录的缺项。用户编辑、同名其他工具、未知符号链接和不安全 TOML 布局会触发保护冲突。clean 不删除用户业务配置、环境变量或其他工具。

报告始终含 `command/status/changed/checks/paths/warnings`。status 为 ok/planned/conflict/failed；changed 只反映实际写入。退出码：0 成功或计划，1 操作/启动失败，2 参数/配置无效，3 保护冲突或诊断不健康。事务逐文件提交，失败回滚仍属于本次写入的内容；并发用户编辑会被保留。中断恢复不使用时间过期或强制覆盖。

## 更新与重新登记

已经通过本页 `setup --host codex` 登记的用户，执行 `npm install -g @devcodex/intent-runtime` 更新命令，再用原配置路径和相同 --name 运行 setup，更新仍由本模块管理且未经用户修改的 Skill，最后重载客户端或开启新 CLI 会话。工具名或 Skill 内容变化时需要这一步；doctor --repair 只恢复拥有权记录中的缺项，不能替代 setup 更新 Skill。用户已修改的内容仍受保护，不会强制覆盖。更新不会自动下载业务配置；clean 只移除本模块拥有的登记和 Skill，不删除配置文件、业务数据或其他工具。

## 常见现象

| 现象 | 下一步 |
|---|---|
| 找不到命令 | 检查全局 bin 是否在客户端 PATH，必要时填写可执行文件绝对路径 |
| 配置不能导入包 | 将配置放入安装了相应本地依赖的项目；全局安装不改变 ESM 的包解析 |
| doctor 返回 conflict | 检查是否有用户编辑、同名登记或不安全布局，不强制覆盖 |
| 工具可见但没有最终结果 | 回到[首次识别](/zh/integrations/codex#3-发起识别)，确认 prepare/accept 完整完成 |
| 识别返回错误或需要澄清 | 按[错误与恢复](/zh/api/errors)区分技术失败与正常 issues |

## CLI 退出码

0 表示成功或 dry-run 计划；1 表示操作或启动失败；2 表示参数/配置无效；3 表示拥有权保护冲突或诊断不健康。`--json` 的报告描述本次维护，不是 IntentResult，也不证明模型已完成识别。
