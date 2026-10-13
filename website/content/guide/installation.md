# 安装与维护

安装模块不会修改宿主配置。全局使用时显式登记 Codex：

```bash
npm install -g @devcodex/intent-runtime
intent-runtime setup --host codex --config /absolute/path/intent.host.config.mjs
```

可信 `.mjs` 配置是普通 Node.js 代码，启动诊断会执行其初始化。host 配置不需要额外 API Key，见 [Codex 接入](/integrations/codex)。

```bash
intent-runtime doctor --host codex
intent-runtime doctor --host codex --repair
intent-runtime clean --host codex
```

| 参数 | 规则 |
|---|---|
| `--host` | 必填，只支持 `codex` |
| `--config` | setup 必填的现有绝对 `.mjs` 路径；其他维护命令禁止 |
| `--name` | 默认 intent-runtime；1～64 字符 `[A-Za-z0-9_.-]`，拒绝原型特殊名称 |
| `--dry-run` | setup/clean/doctor --repair 可用；不写文件、不导入配置、不启动进程 |
| `--json` | 输出一个 MaintenanceReport JSON 对象 |
| `--help` / `--version` | 独立使用，不加载配置或启动服务 |

`INTENT_RUNTIME_HOME` 为显式绝对状态目录，默认用户 `.intent-runtime`；`CODEX_HOME/config.toml` 为 Codex 配置，默认用户 `.codex/config.toml`；Skill 安装到用户 `.agents/skills/<name>/SKILL.md`。这些路径来自本地用户环境，不能由 MCP 参数替换。

setup 幂等，仅编辑对应表。doctor 默认只读，通过实际 stdio 列工具，不调用模型。repair 只恢复仍有拥有权记录的缺项。用户编辑、同名其他工具、未知符号链接和不安全 TOML 布局会触发保护冲突。clean 不删除用户业务配置、环境变量或其他工具。

报告始终含 `command/status/changed/checks/paths/warnings`。status 为 ok/planned/conflict/failed；changed 只反映实际写入。退出码：0 成功或计划，1 操作/启动失败，2 参数/配置无效，3 保护冲突或诊断不健康。事务逐文件提交，失败回滚仍属于本次写入的内容；并发用户编辑会被保留。中断恢复不使用时间过期或强制覆盖。
