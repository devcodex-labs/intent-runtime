import type { SourceRef, StructuredIntent, IntentConstraint, IntentRelation, IntentChange, IntentIssue, JsonValue } from '../contracts/public.js';

export interface NodeDraft {
  key: string; parentKey: string | null; priorRef: SourceRef | null;
  domain: string | null; action: string | null; target: string | null; goal: string;
  understanding: StructuredIntent['understanding']; optional: boolean | null;
  expectedOutput: string[]; sources: SourceRef[];
}
export interface ConstraintDraft {
  key: string; priorRef: SourceRef | null; ownerKey: string | null;
  scope: IntentConstraint['scope']['type']; referenceKey: string | null;
  kind: IntentConstraint['kind']; text: string; expressionJson: string | null; sources: SourceRef[];
}
export interface ReferenceDraft {
  key: string; ownerKey: string; priorRef: SourceRef | null; kind: 'intent' | 'entity' | 'source';
  intentKey: string | null; entityRef: string | null; resolved: boolean; description: string | null; sources: SourceRef[];
}
export interface RelationDraft {
  key: string; priorRef: SourceRef | null; fromKey: string; toKey: string;
  kind: IntentRelation['kind']; condition: string | null; sources: SourceRef[];
}
export interface ChangeDraft {
  operation: IntentChange['operation']; effect: IntentChange['effect']; targetKind: 'intent' | 'constraint' | 'relation' | 'unresolved';
  targetKey: string | null; conditionKey: string | null; description: string; sources: SourceRef[];
  deltaHints: Array<{ path: string; operation: 'set' | 'remove' }>;
}
export interface Observation {
  ownerKey: string | null; container: 'inputs' | 'facts' | 'extensions'; field: string;
  presence: 'known' | 'unknown' | 'not_provided' | 'absent' | 'present_unknown' | 'not_applicable';
  valueJson: string | null; rawText: string | null; sources: SourceRef[];
  semantic: null | {status: 'valid' | 'invalid' | 'unknown'; explanation: string; sources: SourceRef[];
    dependencies: Array<{field: string; requires: 'value' | 'presence'}>};
}
export interface FieldTarget {container: Observation['container']; field: string; path: string}
export interface CandidateMessages {
  changed: string; notApplicable: string; noValue: string; noDeclaration: string;
  explicitNull: string; invalid: string; open: string; mixed: string;
  semanticUnknown: string; unresolved: string; relationConflict: string;
}
export interface Locator { kind: 'intent' | 'constraint' | 'relation' | 'fact'; key: string | null; path: string }
export interface CandidateDraft {
  version: 'candidate-2'; kind: 'request' | 'amendment' | 'confirmation' | 'rejection' | 'withdrawal' | 'answer' | 'statement' | 'mixed' | 'unclear';
  normalizedInput: string; relatedKeys: string[]; historyCoverage: 'complete' | 'partial' | 'unavailable'; usedHistory: boolean;
  messages: CandidateMessages;
  nodes: NodeDraft[]; constraints: ConstraintDraft[]; references: ReferenceDraft[]; relations: RelationDraft[];
  priorTargets: Array<{ kind: 'intent' | 'constraint' | 'relation'; key: string; priorRef: SourceRef }>;
  changes: ChangeDraft[]; observations: Observation[];
  issues: Array<{ key: string; ownerKey: string | null; fieldTarget: FieldTarget | null; code: string; category: IntentIssue['category']; message: string; sources: SourceRef[];
    candidates: Array<{ key: string; description: string; intentKey: string | null; sources: SourceRef[] }>;
    questions: Array<{ question: string; optionKeys: string[] }> }>;
  inferences: Array<{ target: Locator; candidateJson: string | null; explanation: string; sources: SourceRef[] }>;
  evidence: Array<{ target: Locator; sources: SourceRef[] }>;
  suggestions: Array<{ kind: 'clarification' | 'semantic_improvement' | 'conflict_warning'; text: string; relatesTo: string[] }>;
}
export interface CheckedField {
  ownerKey: string | null; container: Observation['container']; field: string; path: string;
  status: 'present' | 'explicit_null' | 'not_provided' | 'unknown' | 'not_applicable' | 'invalid' | 'invalidated' | 'removed';
  trigger: 'selection' | 'invalidation'; value?: JsonValue; explanation?: string; rawText?: string; sources: SourceRef[]; inherited?: boolean;
}
