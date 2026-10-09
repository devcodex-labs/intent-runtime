# 全局安装与自动配置

本功能随新的开发预览实现，尚未作为 npm 正式版本发布。发布到默认 latest 标签后，正常安装只需一条命令：

```sh
npm install -g @devcodex-labs/intent-runtime
```

要求 Node.js >=20.0.0，且 npm 允许运行安装脚本。Windows PowerShell 如被 npm.ps1 执行策略阻止，可在同一行改用 npm.cmd。用户不需要源码仓库、手动构建、单独安装 MCP SDK、Codex CLI 或模型 API Key。

仅本模块被直接全局安装时自动初始化；本地安装、npm ci、间接依赖安装不改客户端配置。当前支持 Codex 的用户级 STDIO MCP；其他客户端通过内部适配器扩展，用户安装命令不变。

## 安装后行为

安装器发现 Codex 的已有配置目录、CLI 或已识别的桌面安装位置，自动注册服务并安装意图识别 Skill。服务使用实际 Node 与全局模块的绝对路径。运行中的客户端可能需要重连/重启来读取配置。

配置位置：

| 文件 | 用途 |
| --- | --- |
| ~/.intent-runtime/intent.config.mjs | 新安装的通用 default 实例，无业务扩展 Schema，默认说明语言 en |
| ~/.intent-runtime/state.json | 注册归属、安装状态、实际实例和检查结果 |
| ~/.intent-runtime/backups/ 与 logs/ | 私有备份和诊断记录，不写入项目 |
| $CODEX_HOME/config.toml，默认 ~/.codex/config.toml | Codex 用户级 MCP 注册 |
| ~/.agents/skills/intent-runtime/SKILL.md | 可由 Codex 发现的识别流程；同名冲突时使用稳定的替代名称 |

已有可确认属于本模块的手工注册可迁移到全局服务入口，保留 --config 所指业务文件和其他设置。未知同名服务保留；安装器采用替代服务名称并在使用指引中说明。用户修改过的使用指引不覆盖。

没有受支持客户端时记录 waiting_for_client，不能称为已配置；以后安装客户端可重装本模块，或执行可选修复。发现客户端后初始化失败，npm 返回错误并恢复本轮客户端配置变更。npm 默认可能隐藏成功脚本输出，因此可通过诊断查看实际状态。

## 使用

在支持 Skill 的 Codex 客户端中选择安装后的 intent-runtime Skill，明确提出意图结构化任务，例如：

> 使用 $intent-runtime，把原始输入“请分析当前需求，不要修改文件。”结构化。使用通用 default 实例，只进行识别，展示真实 prepare/accept 流程和最终结果。

如果已有业务配置只包含 orders 等实例，使用实际实例名称；服务初始化指引会列出已配置的实例。多个实例需要明确选择。安装 Skill 不保证自动拦截全部消息；显式调用和模型实际输出须在本地客户端验证。

业务扩展由用户编辑可信 intent.config.mjs 定义。全局 npm 依赖并不自动让任意用户目录的 .mjs 能解析所有 bare imports；需要 schema-dsl 等自定义导入时，应在该配置所属工程安装依赖，或使用自包含 JSON Schema。已有业务配置保持原目录，避免复制破坏依赖解析。

## 可选维护

```sh
intent-runtime doctor
intent-runtime doctor --json
intent-runtime doctor --repair
intent-runtime clean
```

doctor 检查版本、路径、已管理配置、使用指引和真实 MCP initialize/tools/list/prepare/cancel。默认不改持久配置。--repair 复用安装器进行幂等修复。检查只证明协议可用，不替代桌面加载、触发或语义准确率验收。

clean 仅清理能证明由本模块创建且未被用户修改的注册和 Skill；保留业务配置、其他服务、备份和日志。迁移前的手工注册在原配置仍可用时可恢复。修改过的内容保留并报告 partial，退出非零。重复清理幂等。

完全卸载时先 clean，再 npm uninstall -g @devcodex-labs/intent-runtime。npm 卸载包不保证清除客户端注册。

## 环境与异常

- INTENT_RUNTIME_SKIP_AUTO_CONFIG=1：CI/容器可显式跳过全局自动配置。
- INTENT_RUNTIME_USER_HOME：自定义用户配置宿主，用于隔离测试或明确指定的宿主目录；默认使用当前运行账户的用户目录。不修改系统 HOME。
- CODEX_HOME：遵循 Codex 的自定义用户配置位置。
- Windows 原生和 WSL 是独立宿主，分别在对应环境安装；路径不能混用。
- 项目或 profile 配置可能覆盖用户注册；doctor 会指出能确认的当前项目覆盖，仍须以客户端实际配置为准。
- 安装脚本被禁用时不能自动初始化；可在允许脚本的环境重新安装，或使用 doctor --repair。
- 损坏的 TOML、缺失的用户业务文件或用户修改不会用猜测值替换。先按诊断修正，再运行相同安装命令或修复工具。

源码验证使用 npm run smoke:installation，在隔离用户目录和全局 prefix 安装真实 tarball。它不会改开发者的真实客户端配置，也不调用模型 API。
