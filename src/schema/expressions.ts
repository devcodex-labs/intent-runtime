import type {CandidateDraft} from '../model/candidate.js';
import type {StructuredExpression, ExpressionOperand} from '../contracts/public.js';
import {IntentError, violation} from '../contracts/errors.js';
import {EXPRESSION_SCHEMA} from '../contracts/generated.js';
import {ContractValidator} from '../internal/contracts.js';
import {decodeJson, measure} from '../internal/json.js';
import {resolve, tokens} from '../internal/pointer.js';
import {sourceValue} from '../internal/source.js';
import type {Definition} from './compile.js';

// Schema paths can involve caller-declared regular expressions. Validate them
// in the owned worker, then return typed approval and decoded expressions;
// assembly only rewrites identities and verifies final output locations.
export function checkExpressions(draft: CandidateDraft, materials: Record<string, unknown>, schema: Definition | undefined, contracts: ContractValidator, maxBytes: number, maxDepth: number): {expressions: Array<{key: string; value: StructuredExpression}>; inputPaths: string[]} {
  const inputPaths = new Set<string>(), expressions: Array<{key: string; value: StructuredExpression}> = [];
  let location = '/constraints';
  const operand = (o: ExpressionOperand): void => {
    if (o.type === 'literal') return;
    if (o.type === 'source') {sourceValue(o.ref, materials, location); return;}
    const owner = draft.nodes.find(n => n.key === o.intentId); if (!owner) violation(location, 'REFERENCE_NOT_FOUND');
    let parts: string[]; try {parts = tokens(o.path);} catch {return violation(location, 'STRUCTURE');}
    const prior = owner.priorRef ? sourceValue(owner.priorRef, materials) : undefined;
    const inputs = prior && typeof prior === 'object' ? (prior as Record<string, unknown>).inputs : undefined;
    if (!schema?.hasPath(parts) && !resolve(inputs, o.path).found) violation(location, 'REFERENCE_NOT_FOUND');
    inputPaths.add(JSON.stringify([o.intentId, o.path]));
  };
  const inspect = (expression: StructuredExpression): void => {
    if (expression.type === 'comparison') {operand(expression.left); operand(expression.right);}
    else if (expression.type === 'not') inspect(expression.item);
    else {if (!expression.items.length) violation(location, 'STRUCTURE'); expression.items.forEach(inspect);}
  };
  for (const [index, c] of draft.constraints.entries()) if (c.expressionJson !== null) {
    location = '/constraints/' + index + '/expressionJson';
    let value: unknown;
    try {value = decodeJson(c.expressionJson, maxDepth);} catch (cause) {if (cause instanceof IntentError) throw cause; return violation(location, 'STRUCTURE');}
    measure(value, {maxBytes, maxDepth, limit: 'maxOutputBytes', stage: 'validation', invalid: 'MODEL_OUTPUT_INVALID'});
    contracts.candidate(EXPRESSION_SCHEMA, value, location); inspect(value as StructuredExpression);
    expressions.push({key: c.key, value: value as StructuredExpression});
  }
  return {expressions, inputPaths: [...inputPaths]};
}
