<span id="codex-安装维护与排障" aria-hidden="true"></span>

# Maintain and troubleshoot Codex setup

For first use, follow [Connect Codex](/integrations/codex) through configuration, registration, and recognition. Use this page to inspect an existing registration, repair missing owned files, or remove this module.

<span id="安装与登记的区别" aria-hidden="true"></span>

## Installation versus registration

Package installation provides commands. setup registers user-level MCP and installs the recognition Skill in host mode. Complete [global installation](/guide/installation) first. The configuration must be an existing trusted absolute .js/.mjs path. It is Node.js code whose initialization runs at startup. Use an ESM project for .js; compile TypeScript configuration to ESM .js.

```bash
intent-runtime setup --host codex --config /absolute/path/intent.host.config.mjs --dry-run
intent-runtime setup --host codex --config /absolute/path/intent.host.config.mjs
```

Preview first, then register when appropriate. Quote Windows paths containing spaces. Reload the client after setup. Visible tools prove registration; recognition still needs prepare/accept.

<span id="检查修复与移除" aria-hidden="true"></span>

## Inspect, repair, and remove

```bash
intent-runtime doctor --host codex
intent-runtime doctor --host codex --repair
intent-runtime clean --host codex
```

| Option | Rule |
|---|---|
| --host | Required; only codex |
| --config | Existing absolute .js/.mjs path required for setup; forbidden for other maintenance commands |
| --name | Defaults to intent-runtime; 1–64 characters [A-Za-z0-9_.-]; __proto__, prototype, constructor forbidden |
| --dry-run | Available for setup/clean/doctor --repair; no writes, config import, or process startup |
| --json | One MaintenanceReport JSON object |
| --help / --version | Standalone; no configuration loading or service startup |

INTENT_RUNTIME_HOME is an explicit absolute state directory, defaulting to the user's .intent-runtime. CODEX_HOME/config.toml defaults to .codex/config.toml. The Skill is installed at .agents/skills/&lt;name&gt;/SKILL.md. These local paths cannot be replaced through MCP arguments.

setup is idempotent and edits only its registration table. doctor is read-only by default, lists real stdio tools, and does not call a model. repair restores only missing content with a retained ownership record. User edits, another tool's name, unknown symlinks, or unsafe TOML layouts trigger protection conflicts. clean does not delete business configuration, environment variables, or other tools.

Reports always contain command/status/changed/checks/paths/warnings. status is ok/planned/conflict/failed; changed reflects actual writes only. Exit codes: 0 success/plan; 1 operation/startup failure; 2 invalid arguments/configuration; 3 protection conflict or unhealthy diagnostics. Transactions commit per file and roll back only content still owned by this write. Concurrent user edits are preserved. Interrupted recovery does not use expiry or forced overwrites.

<span id="更新与重新登记" aria-hidden="true"></span>

## Update and register again

For an existing setup registration, run npm install -g @devcodex/intent-runtime, then setup or doctor --repair as needed and reload the client. Updates do not download business configuration. clean removes this module's owned registration/Skill without deleting configuration, business data, or other tools.

<span id="从自动登记方式升级" aria-hidden="true"></span>

## Migrate an old automatic registration

If an earlier global installation registered Codex automatically, migrate that registration before current setup. The old state.json and current registrations.json are separate ownership records. Updating npm does not take ownership of unknown same-name content. Repeating setup/repair after exit 3 does not resolve that difference.

<span id="还没有更新全局命令" aria-hidden="true"></span>

### Before updating the global commands

1. Exit clients using the service. Back up the actual CODEX_HOME/config.toml, INTENT_RUNTIME_HOME state directory, and user .agents/skills/intent-runtime. Use the default paths above if environment overrides are absent. Back up business configuration separately.
2. Check intent-runtime --help still shows the old automatic-registration command: no setup and clean does not require --host. Run the first command below **before updating the global package**. Inspect its report and backups to confirm it removed only owned content. If content was edited or cleanup failed, use the next section.
3. Install the current package, create trusted host configuration, explicitly register, diagnose, and reload:

```bash
# Only with the old automatic-registration command still installed:
intent-runtime clean --json

# Then install and register the current commands:
npm install -g @devcodex/intent-runtime
intent-runtime setup --host codex --config /absolute/path/intent.host.config.mjs --dry-run
intent-runtime setup --host codex --config /absolute/path/intent.host.config.mjs
intent-runtime doctor --host codex
```

<span id="已经更新setup-返回保护冲突" aria-hidden="true"></span>

### Already updated, with a protection conflict

1. Preserve and back up the files above. Current clean cannot remove unknown content using old state.json. Do not delete the entire Codex configuration or state directory.
2. Inspect the exact [mcp_servers.intent-runtime] table, possible subtables, and matching Skill. After establishing ownership and a complete backup, manually move aside only that registration and Skill. Preserve other MCP registrations, global settings, business configuration, and backups. Merge your edits into the new configuration first.
3. Run current setup/doctor, reload the client, and complete [first recognition](/integrations/codex#3-recognize-a-request). Successful doctor proves registration/tool discovery only.

When old ownership is uncertain, preserve it and test the current integration under an unused name:

```bash
intent-runtime setup --host codex --name intent-runtime-v2 --config /absolute/path/intent.host.config.mjs
intent-runtime doctor --host codex --name intent-runtime-v2
```

This does not remove the old registration. Explicitly select the new service's tools during verification. Resolve old content from backups after confirming ownership. Pass the same --name to clean the new registration. Migration concerns client registration; it does not restore old recognition APIs or make old results valid baselines.

<span id="常见现象" aria-hidden="true"></span>

## Common symptoms

| Symptom | Next step |
|---|---|
| Command missing | Check global bin on client PATH or use an absolute executable path |
| Configuration cannot import packages | Put it in a project with local dependencies; global installation does not change ESM resolution |
| doctor returns conflict | Inspect user edits, same-name registrations, or unsafe layout; do not force overwrites |
| Tools visible but no final result | Verify the full [prepare/accept chain](/integrations/codex#3-recognize-a-request) |
| Recognition error or clarification | Distinguish technical failure from normal issues using [Recovery](/api/errors) |

<span id="cli-退出码" aria-hidden="true"></span>

## CLI exit codes

0 means success/dry-run plan; 1 operation/startup failure; 2 invalid arguments/configuration; 3 ownership conflict or unhealthy diagnostics. The --json report describes maintenance, not an IntentResult or proof of completed model recognition.
