# Intent Runtime

Intent Runtime structures user intent for Node.js applications and MCP hosts. It understands only the input, context, baseline and business definitions explicitly supplied by the caller. It does not discover tools, plan implementation, authorize actions, execute business operations or store task history.

V2 is being rewritten on `refactor/runtime`. The repository currently contains the Native recognition core and fixed regression tests; the published 1.x package has a different API. API adapters, MCP/host integration, maintenance commands and full package acceptance remain pending. Do not use the published 1.x package to run V2 examples.

## Native API

```ts
import { Intent, type ModelExecutor } from '@devcodex/intent-runtime';
import { s } from 'schema-dsl/pure';

// Implement generate() using your model gateway. The request supplies
// instructions, explicit input materials, the candidate schema and a signal.
declare const executor: ModelExecutor;
const intent = new Intent({
  executor,
  language: 'zh-CN',
  schema: s({ orderId: s('string!').description('Order identifier; preserve leading zeros') }),
});
try {
  const result = await intent.parse({ input: '查询订单000123', fields: ['orderId'] });
  console.log(result.effective.intents[0]?.inputs.orderId);
} finally {
  await intent.dispose();
}
```

`fields` defaults to `[]`. Business parameters belong to the relevant intent's `inputs`; selected facts without an action belong to `turn.facts`. Complete intents are stored once in `effective`. `turn.intentIds` and `turn.changes` describe this turn. A complete understanding is not permission to execute.

Context is a free JSON object. For another turn, explicitly supply relevant `context` and/or the previous `effective` as `baseline`. The core does not implicitly remember previous calls. Both result and baseline use contract version `2.0-draft.6`.

Business validation uses real `schema-dsl@3.0.4`, with defaults, coercion and additional-property removal disabled. Unknown dependencies remain unknown; selected values are admitted only after validation. Explicit edits invalidate affected prior values, including unselected dependent values. The default recognition deadline is disabled (`timeoutMs: 0`).

## Development

Requires Node.js >=20.0.0. Install dependencies with `npm ci --ignore-scripts`.

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

Tests use controlled language candidates and the actual business validator. Pass counts are not natural-language accuracy measurements. Set `INTENT_TEST_DIR` and `INTENT_BUILD_DIR` to keep outputs outside the checkout; `INTENT_TEST_NODE` selects a runtime for compatibility tests. `npm run schema:generate` regenerates public/candidate schemas from TypeScript types.

Installation does not edit host configuration. Codex CLI/Desktop, provider models, all MCP protocol targets, maintenance and an empty-directory tarball require separate acceptance evidence before V2 release.

Licensed under [MIT](LICENSE).
