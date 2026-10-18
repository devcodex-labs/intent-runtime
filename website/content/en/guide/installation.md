<span id="安装与版本" aria-hidden="true"></span>

# Installation

Applications require **Node.js ≥20, npm, and ESM**. Both **JavaScript and TypeScript** are supported. Use .js in a project with `"type": "module"`, or .mjs for a standalone ESM file. TypeScript uses your existing ESM compilation process; the package includes type declarations. The website's build tools are not required.

<span id="选择安装方式" aria-hidden="true"></span>
<span id="安装版本与-codex-维护" aria-hidden="true"></span>
<span id="先确认安装版本" aria-hidden="true"></span>

## Choose where to install

This documentation describes **Intent Runtime V2**.

| Your goal | Install into | Next step |
|---|---|---|
| Call it from Node.js | Your application project | [Quick start](/guide/quick-start) |
| Use the current Codex model | Global commands | [Configure, register, reload, and recognize](/integrations/codex) |
| Add tools to an MCP server | The existing server project | [Complete SDK example](/integrations/mcp-sdk) |
| Run a standalone MCP server | Global commands or a service project | [Choose stdio or HTTP](/integrations/mcp) |

<span id="安装到-nodejs-项目" aria-hidden="true"></span>
<span id="获取当前-v2-包" aria-hidden="true"></span>

## Install into a Node.js project

Run in your application directory:

```bash
npm install @devcodex/intent-runtime
```

npm automatically installs the required dependencies, including schema-dsl. You do not need a separate schema-dsl installation. Use the npm supplied with Node.js 20 or later.

Check the dependency tree and load the public export:

```bash
npm ls @devcodex/intent-runtime schema-dsl
node --input-type=module -e "import {Intent} from '@devcodex/intent-runtime'; console.log(typeof Intent)"
```

The last command should print `function`. It checks module loading without calling a model. Continue with the [JavaScript or TypeScript quick start](/guide/quick-start).

<span id="全局安装与登记-codex" aria-hidden="true"></span>

## Global commands and Codex registration

To connect Codex or start a standalone MCP service:

```bash
npm install -g @devcodex/intent-runtime
intent-runtime --version
intent-runtime-mcp --version
```

Global installation does not change client configuration. Follow [Connect Codex](/integrations/codex) to save a configuration and run setup explicitly. Host mode uses the current model and needs no additional model API key. Standalone stdio does not require Codex registration.

Standalone MCP startup and Codex diagnostics use the optional MCP SDK dependencies, which a normal installation includes. Installing with --omit=optional removes that startup capability. Native/API and the SDK-independent adapter have separate coverage; see [Compatibility](/testing/validation).

CLI configuration accepts a trusted absolute .js or .mjs path. For .js, configure the project as ESM. Compile TypeScript configuration to ESM .js before passing it to the CLI; Node 20 does not provide general native TypeScript execution.

Global installation does not make global packages resolvable from every configuration file. A configuration importing a Builder or API adapter must live in a project with those local dependencies. Copy the complete configuration from the corresponding integration guide.

<span id="更新" aria-hidden="true"></span>

## Update

Run `npm install @devcodex/intent-runtime` in the application, or `npm install -g @devcodex/intent-runtime` for global commands. See the [changelog](https://github.com/devcodex-labs/intent-runtime/blob/main/CHANGELOG.md) for changes and [Codex maintenance](/operations/codex) for checks, repair, cleanup, flags, and exit codes. The component does not automatically download or overwrite your business configuration.
