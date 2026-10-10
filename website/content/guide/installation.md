---
title: 安装与维护
description: 全局安装如何自动配置 Codex，以及升级、诊断、修复和清理的实际行为。
---

# 安装与维护

## 自动配置的触发条件

正式版本可用后，直接执行 `npm install -g @devcodex-labs/intent-runtime`，安装脚本才会尝试配置检测到的客户端。全局依赖的间接安装、应用本地依赖安装和源码 `npm ci` 不会自动修改客户端配置。

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
| `intent-runtime clean` | 清理仍归模块管理的注册和 Skill，保留业务配置 |

`doctor` 检测不健康时退出码为 1。`clean` 可重复运行；用户编辑过的注册或 Skill 会被保留并给出提示。安装、修复和清理保留备份与恢复记录，用于处理中断和冲突。

## 禁用安装脚本

`--ignore-scripts` 会跳过自动配置。安装后执行：

```bash
intent-runtime doctor --repair
```

若明确希望全局安装但不修改客户端，安装前可设置 `INTENT_RUNTIME_SKIP_AUTO_CONFIG=1`；之后按需手动修复。通常无需设置这个变量。

## 升级和旧配置

模块更新自己管理的入口，并尽量保留已有业务配置、instance、环境变量和工作目录。迁移中若路径含糊、配置被同时修改或归属不清，安装会报告问题，不会直接覆盖陌生配置。

业务配置是可执行的可信 `.mjs` 文件。错误路径、依赖缺失、语法问题或标准输出污染都可能使 MCP 无法启动。根据诊断修复这些问题，再重新运行。

## 卸载

建议在卸载前执行：

```bash
intent-runtime clean
npm uninstall -g @devcodex-labs/intent-runtime
```

npm 卸载本身不负责运行本模块的配置清理。业务配置和安装备份不会被 `clean` 删除；确认不再需要后由你手动处理。源码测试和日常本地依赖安装无需这一套全局维护流程。
