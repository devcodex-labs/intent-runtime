# Development

## Requirements

- Node.js 20 or newer.
- npm 10 or newer.

## Commands

```bash
npm install
npm run typecheck
npm test
npm run build
npm pack --dry-run
```

## Public Contract Checks

Before changing exported types or function names, update:

- `src/index.ts`
- `README.md`
- `docs/intent-record.md`
- tests under `test/`

## Project Shape

This package is intentionally a pure library. Do not add CLI, server, worker, or UI entry points unless the project scope is explicitly changed.
