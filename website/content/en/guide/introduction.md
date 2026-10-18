<span id="项目定位" aria-hidden="true"></span>

# Introduction

Intent Runtime turns user intent into a structure your application or MCP tools can read. Give it a request and relevant material; receive goals, requirements, prohibitions, business parameters, and questions that need clarification.

For “Look up order 000123. Do not cancel the order,” it preserves the lookup goal and the prohibition. With an orderId Schema, it can also preserve the string "000123". Your application decides whether to call its order system. Intent Runtime does not query or cancel orders.

<span id="适合哪些任务" aria-hidden="true"></span>

## When to use it

Use it before handing natural-language requests to application logic, when you need to preserve goals, prohibitions, conditions, and unresolved questions. Configure business fields only when you need parameters such as an order ID. It is not an order system, business task manager, or autonomous execution agent.

<span id="输入和结果" aria-hidden="true"></span>

## Input and output

| You supply | You receive |
|---|---|
| Original input | Goals and constraints expressed by the user |
| Free-form JSON context or an optional baseline | Supported references, additions, changes, and withdrawals |
| Optional business Schema and fields | Parameters with explicit ownership, validation status, and issues |
| Optional business semantics | Actions and objects interpreted using your domain vocabulary |

Intent recognition works without a Schema. Field extraction is optional. Understanding, field validation, and business authorization are separate layers; see [Read the result](/guide/results).

“Analyze this project” can express an analysis goal. If no project material is supplied, the component does not read a repository, invent project capabilities, or create an implementation plan. Unresolved references remain questions.

Choose an [integration](/integrations/index), run the [quick start](/guide/quick-start), then learn to [read the result](/guide/results). Full parameter and type definitions are in the reference; you do not need to read them all first.

It understands only caller-supplied material. Goals and ordering come from the user's expression. It does not search projects or history, choose business tools, generate implementation plans, manage business tasks, authorize, or execute operations. Model generation and local validation are dependencies of recognition.

The application owns messages, model selection, results, and business state. Supply relevant context or the previous effective snapshot explicitly for subsequent turns. Model candidates undergo source, business-rule, identity, and public-structure checks. Passing programmatic checks is not a natural-language accuracy guarantee.

<span id="下一步" aria-hidden="true"></span>

## Next step

[Choose an integration](/integrations/index), or make your [first Node.js call](/guide/quick-start).

The npm package version and result format version are separate identifiers. Successful results and baselines use schemaVersion `2.0-draft.6`.
