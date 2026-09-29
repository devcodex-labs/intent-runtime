# Intent Record

An intent record is the canonical output of this package.

```ts
interface IntentRecord {
  schemaVersion: "1.0";
  intentId: string;
  action: string;
  summary: string;
  source: IntentSource;
  actor?: IntentActor;
  target?: IntentTarget;
  constraints: readonly IntentConstraint[];
  priority: "low" | "normal" | "high" | "critical";
  confidence: number;
  trace: readonly IntentTraceEntry[];
  metadata: Readonly<Record<string, unknown>>;
  createdAt: string;
}
```

## Required Semantics

- `intentId` identifies one intent record.
- `action` is a normalized verb-like label.
- `summary` keeps a human-readable statement of the intent.
- `source` records input origin and optional raw payload.
- `constraints` captures structured limits or requirements.
- `confidence` is a number from `0` to `1`.
- `trace` records transformation steps.
- `metadata` is an extension bag for consumers.

## Extension Policy

Consumers should prefer `metadata` for local fields instead of widening the core schema. Core fields should change only when they benefit broad consumers and can be validated consistently.
