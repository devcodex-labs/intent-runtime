# intent-runtime

`intent-runtime` is a pure Node.js TypeScript library for turning natural language or external input into standardized, structured, verifiable, extensible, and traceable intent records.

It is designed as a library first: no CLI, no HTTP service, and no UI in the initial scope.

## Install

```bash
npm install @devcodex-labs/intent-runtime
```

## Usage

```ts
import {
  parseIntent,
  validateIntentRecord
} from "@devcodex-labs/intent-runtime";

const record = parseIntent("Create a public npm package for intent-runtime");
const validation = validateIntentRecord(record);

console.log(record.intentId, validation.valid);
```

## Core Concepts

- Intent record: the stable structured artifact emitted by this library.
- Parser: converts raw input into a baseline intent record.
- Normalizer: fills defaults and stabilizes record shape.
- Validator: verifies required fields, schema version, date values, priority, confidence, and trace shape.
- Trace: captures how the intent moved through receive, parse, normalize, validate, and enrichment stages.

## Public API

- `parseIntent(input, options)`
- `createIntentRecord(input, options)`
- `normalizeIntentRecord(draft, options)`
- `validateIntentRecord(record)`
- `assertValidIntentRecord(record)`
- `createIntentId(now)`
- `createTraceEntry(stage, note, data, now)`
- `appendTrace(trace, stage, note, data, now)`

## Development

```bash
npm install
npm test
npm run build
```

## Publishing

This package is configured as a public scoped npm package. Tag pushes matching `v*` run the publish workflow.

Required repository secret:

- `NPM_TOKEN`

See [docs/release.md](docs/release.md) for the release flow.

## License

MIT
