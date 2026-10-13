import { parentPort } from 'node:worker_threads';
import type { ValidationTask, ValidationReply } from './runner.js';
import { Definition } from './compile.js';
import { BusinessValidator, ValidationBudget } from './validate.js';
import { checkFields } from './fields.js';
import { IntentError } from '../contracts/errors.js';
import {ContractValidator} from '../internal/contracts.js';
import {checkExpressions} from './expressions.js';
const validator = new BusinessValidator();
const contracts = new ContractValidator();
parentPort!.on('message', (task: ValidationTask) => {
  const budget = new ValidationBudget(task.maxChecks); budget.used = task.used;
  try {
    const schema = task.schema ? new Definition(task.schema, task.maxSchemaBytes, task.maxDepth) : undefined;
    const extension = task.extension ? new Definition(task.extension, task.maxSchemaBytes, task.maxDepth) : undefined;
    const checked = checkFields(task.draft, task.materials, schema, extension, task.selection, task.extensions, validator, budget, task.maxBytes, task.maxDepth);
    const expressions = checkExpressions(task.draft, task.materials, schema, contracts, task.maxBytes, task.maxDepth);
    const reply: ValidationReply = {...checked, ...expressions, used: budget.used}; parentPort!.postMessage({reply});
  } catch (cause) {
    const error = cause instanceof IntentError && !['SCHEMA_INVALID', 'SCHEMA_UNSUPPORTED_FOR_EXTRACTION', 'CONFIG_INVALID'].includes(cause.code) ? cause : new IntentError('INTERNAL_PROCESSING_FAILED', {stage: 'validation'});
    parentPort!.postMessage({error: error.toJSON(), used: budget.used});
  }
});
