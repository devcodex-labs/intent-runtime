import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSchemaError } from '../src/schema/errors.js';
test('HD-ERR-01 empty property token remains /meta/', () => assert.equal(normalizeSchemaError({ keyword: 'required', instancePath: '/meta', params: { missingProperty: '' } })[0]?.path, '/meta/'));
test('HD-ERR-02 malformed fallback pointer is rejected', () => assert.throws(() => normalizeSchemaError({ keyword: 'type', path: '/a~2b' }), { code: 'INTERNAL_PROCESSING_FAILED' }));
test('HD-ERR-03 non-pointer fallback cannot silently become root', () => assert.throws(() => normalizeSchemaError({ keyword: 'type', path: 'orders/1/amount' }), { code: 'INTERNAL_PROCESSING_FAILED' }));
test('All path entrances preserve escaping and array indices', () => {
  assert.equal(normalizeSchemaError({ keyword: 'minimum', instancePath: '/orders/1/amount' })[0]?.path, '/orders/1/amount');
  assert.equal(normalizeSchemaError({ keyword: 'required', instancePath: '/meta', params: { missingProperty: 'a/~b' } })[0]?.path, '/meta/a~1~0b');
  assert.throws(() => normalizeSchemaError({ keyword: 'type', instancePath: '/a~2b' }));
});
