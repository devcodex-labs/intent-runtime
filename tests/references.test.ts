import test from 'node:test';
import assert from 'node:assert/strict';
import {Definition} from '../src/schema/compile.js';
import {BusinessValidator, ValidationBudget} from '../src/schema/validate.js';
test('Chained local refs preserve root assertions and original data location', () => {
  const schema = {type: 'object', properties: {amount: {type: 'number'}}, definitions: {first: {$ref: '#/definitions/second'}, second: {properties: {amount: {maximum: 10}}}}, allOf: [{$ref: '#/definitions/first'}]};
  const plan = new Definition(schema, 262144, 64).plan('amount'); const validator = new BusinessValidator();
  try {const result = validator.validate(plan.rule, {amount: 15}, new ValidationBudget(256)); assert.equal(result.valid, false); assert.ok(result.errors.some(e => e.path === '/amount'));} finally {validator.close();}
});
test('Diamond local-ref DAG remains shared, with precise selected validation', () => {
  const definitions: Record<string, unknown> = {base: {properties: {amount: {maximum: 10}}}};
  let previous = 'base';
  for (let i = 0; i < 10; i++) {const current = 'n' + i; definitions[current] = {allOf: [{$ref: '#/definitions/' + previous}, {$ref: '#/definitions/' + previous}]}; previous = current;}
  const definition = new Definition({type: 'object', properties: {amount: {type: 'number'}}, definitions, allOf: [{$ref: '#/definitions/' + previous}]} as never, 262144, 64);
  const plan = definition.plan('amount'), validator = new BusinessValidator();
  try {assert.ok(JSON.stringify(plan.rule).length < 10000); assert.equal(validator.validate(plan.rule, {amount: 15}, new ValidationBudget(256)).valid, false);} finally {validator.close();}
});
for (const rule of [{allOf: [false]}, {not: true}, {oneOf: [true, true]}]) test('Constant root assertion remains active: ' + JSON.stringify(rule), () => {
  const schema = {type: 'object', properties: {amount: {type: 'number'}, unselected: {type: 'string'}}, ...rule};
  const plan = new Definition(schema, 262144, 64).plan('amount'), validator = new BusinessValidator();
  try {assert.equal(plan.reads.has('unselected'), false); assert.equal(validator.validate(plan.rule, {amount: 5}, new ValidationBudget(256)).valid, false);} finally {validator.close();}
});
