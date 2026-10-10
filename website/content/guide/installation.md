---
title: 安装与维护
description: 全局安装如何自动配置 Codex，以及升级、诊断、修复和清理的实际行为。
---

# 安装与维护

## 自动配置的触发条件

直接执行 `npm install -g @devcodex/intent-runtime` 时，安装脚本会尝试配置检测到的客户端。全局依赖的间接安装、应用本地依赖安装和源码 `npm ci` 不会自动修改客户端配置。

Codex 检测会检查用户配置目录、CLI 可执行文件及受支持的桌面安装位置。未检测到客户端时，不代表模块无法安装；安装状态会反映未配置客户端的情况，安装客户端后可运行修复命令。

正常情况下，安装依次完成注册、业务配置初始化、Skill 安装和 SDK MCP 握手及 prepare/cancel 探测。该探测使用受控输入，不生成模型候选，也不执行业务动作。

## 安装后需要做什么

重新启动 CLI 会话或重载 Desktop，使新的配置和 Skill 生效。工具注册不自动拦截全部对话，识别时需要明确启用工作流。业务 Schema、输出语言和 instance 按[配置说明](./configuration.md)修改。

模块绑定安装时的 Node 可执行文件与实际全局包路径。改变 Node 版本或全局安装位置后，重新安装或执行修复，使注册指向当前可用位置。

## 诊断、修复与清理

| 命令 | 行为 |
| --- | --- |
| `intent-runtime doctor` | 检查 Node、安装状态、用户注册、Skill 与实际 MCP 探测 |
| `intent-runtime doctor --json` | 输出机器可读的诊断记录 |
| `intent-runtime doctor --repair` | 更新当前安装的配置，然后诊断；同次修复中未变化的配置复用已通过的探测 |
| `intent-runtime doctor --repair --json` | 修复后输出机器可读的诊断记录 |
| `intent-runtime clean` | 清理仍归模块管理的注册和 Skill，保留业务配置 |
| `intent-runtime clean --json` | 输出机器可读的清理结果 |
| `intent-runtime --help` | 显示支持的命令；不带参数也显示帮助 |

`clean` 可重复运行；用户编辑过的注册或 Skill 会被保留并给出提示。安装、修复和清理保留备份与恢复记录，用于处理中断和冲突。

### 退出码与状态

| 退出码 | 含义 |
| --- | --- |
| 0 | doctor 健康、clean 完成，或正常显示帮助 |
| 1 | doctor 不健康、clean 只完成部分清理，或维护操作失败 |
| 2 | 命令或参数组合错误，例如 `clean --repair` |

正常维护结果的 status 为 `healthy`、`unhealthy`、`cleaned` 或 `partial`。partial 表示一些用户修改过的项目被保留，不应自动删除这些内容。

安装状态文件的 status 是另一组值：`configured`、`waiting_for_client`、`failed`、`cleaned`。`waiting_for_client` 表示未发现受支持客户端；安装客户端后运行 doctor --repair。它不是 doctor 的健康状态，不能混用两者的 status。

### JSON 输出

正常返回的维护结果包含以下字段；checks、warnings 和路径以实际输出为准：

```json
{
  "status": "unhealthy",
  "checks": [
    { "name": "registration", "ok": false, "detail": "No managed MCP registration; run doctor --repair after installing a supported client." }
  ],
  "warnings": [],
  "statePath": "<用户目录>/.intent-runtime/state.json"
}
```

操作抛出异常时，输出结构不同，不含 checks、warnings 或 statePath：

```json
{
  "status": "failed",
  "code": "TRUSTED_CONFIG_MISSING",
  "message": "Existing trusted instance config is missing: <实际配置路径>"
}
```

脚本应先检查 status 和退出码，再读取对应字段。JSON 中的 message/detail 用于说明，不作为稳定分支条件；用法错误会输出用法文本，即使带 --json 也不是 JSON。

## 禁用安装脚本

`--ignore-scripts` 会跳过自动配置。安装后执行：

```bash
intent-runtime doctor --repair
```

若明确希望全局安装但不修改客户端，安装前可设置 `INTENT_RUNTIME_SKIP_AUTO_CONFIG=1`；之后按需手动修复。通常无需设置这个变量。

## 升级和旧配置

模块更新自己管理的入口，并尽量保留已有业务配置、instance、环境变量和工作目录。迁移中若路径含糊、配置被同时修改或归属不清，安装会报告问题，不会直接覆盖陌生配置。

业务配置是可执行的可信 `.mjs` 文件。错误路径、依赖缺失、语法问题或标准输出污染都可能使 MCP 无法启动。根据诊断修复这些问题，再重新运行。

## 常见问题与处理

下面是常见维护错误，不属于 Intent.parse 的错误枚举。失败 JSON 可包含 code；doctor 的正常诊断通常通过 checks/detail 说明问题。

| code / 现象 | 处理方法 |
| --- | --- |
| `NODE_UNSUPPORTED` / Node 检查失败 | 安装 Node ≥20.0.0，确认当前命令使用的 Node，然后重新安装或修复 |
| `BUILD_MISSING`、`WORKFLOW_MISSING`、依赖缺失 | 重新安装完整包；源码使用先 npm ci、npm run build |
| 无管理注册 / `REGISTRATION_MISSING` | 核对 Codex 已安装、实际用户目录及 CODEX_HOME，再运行 doctor --repair |
| `REGISTRATION_DISABLED` | 核对该注册是否被你禁用；需要启用时修改实际客户端配置并重载 |
| `INSTALL_BUSY` | 等当前安装或维护进程结束后重试，不同时运行多次修复或清理 |
| `TRUSTED_CONFIG_MISSING` | 恢复实际业务配置或修正 --config 路径；不会用新空配置替代既有业务定义 |
| `CONFIG_PATH_AMBIGUOUS` | 已有相对 --config 无法确定位置，改用绝对配置路径或明确绝对 cwd |
| `TOML_INVALID`、`TOML_VALUE_INVALID`、`MCP_CONFIG_INVALID`、`MCP_ENTRY_INVALID` | 修正 config.toml 的语法、mcp_servers 结构、启动命令、参数与 cwd，再重试 |
| `STATE_INVALID`、`LOCK_INVALID`、`RECOVERY_INVALID` | 保存状态、锁或恢复记录供检查，核对文件内容及权限；不要直接删除以绕过错误 |
| `CONFIG_CHANGED`、`RECOVERY_CONFLICT`、`ROLLBACK_INCOMPLETE` | 暂停并行编辑，保留用户修改，检查备份与恢复记录中的冲突，处理后再修复 |
| `CONFIG_SYMLINK_BROKEN` | 恢复链接目标或修正实际配置路径 |
| `LOCK_UNAVAILABLE`、文件权限错误 | 确认用户配置目录可写、维护守卫可用，然后重试 |
| `MCP_PROBE_FAILED` | 用相同 Node、参数、cwd 和环境启动 MCP，检查配置 import、依赖及标准错误；标准输出只用于协议 |
| clean 返回 `partial` | 查看 warnings，核对保留的注册和 Skill；仅在你确认不需要时手动清理 |

日志位于 `~/.intent-runtime/logs/installation.jsonl`；路径被迁移或存在名称冲突时，以 doctor 输出和状态记录为准。配置完成后重启 CLI 会话或重载 Desktop，并在目标客户端核对实际工具。

## 卸载

建议在卸载前执行：

```bash
intent-runtime clean
npm uninstall -g @devcodex/intent-runtime
```

npm 卸载本身不负责运行本模块的配置清理。业务配置和安装备份不会被 `clean` 删除；确认不再需要后由你手动处理。源码测试和日常本地依赖安装无需这一套全局维护流程。
