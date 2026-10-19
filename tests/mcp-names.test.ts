import test from 'node:test';
import assert from 'node:assert/strict';
import {Intent, type IntentResult} from '../src/index.js';
import {createIntentMcpAdapter, type HostTask, type IntentMcpMode, type IntentMcpSession, type IntentMcpToolResult} from '../src/mcp/index.js';
import {controlled, draft, observation} from './helpers.js';

const names = {
  host: ['intent_runtime_prepare', 'intent_runtime_accept', 'intent_runtime_cancel'],
  executor: ['intent_runtime_parse'],
};
function content(result: IntentMcpToolResult | undefined) {
  assert(result); assert.equal(result.isError, false, result.content[0]?.text);
  return result.structuredContent!;
}
async function recognize(session: IntentMcpSession, mode: IntentMcpMode, prefix: string, instance?: string): Promise<IntentResult> {
  const args = {input: 'query order 000123', fields: ['orderId'], ...(instance === undefined ? {} : {instance})};
  if (mode === 'executor') return content(await session.callTool(prefix + 'intent_runtime_parse', args)) as unknown as IntentResult;
  const task = content(await session.callTool(prefix + 'intent_runtime_prepare', args)) as unknown as HostTask;
  const candidate = draft(); candidate.observations = [observation('orderId', '000123')];
  return content(await session.callTool(prefix + 'intent_runtime_accept', {requestId: task.requestId, submissionToken: task.submissionToken, candidateText: JSON.stringify(candidate)})) as unknown as IntentResult;
}

for (const mode of ['host', 'executor'] as const) {
  test('MCP ' + mode + ' has namespaced defaults and exact routing without old aliases', async () => {
    const intent = new Intent({executor: controlled(() => draft())});
    const adapter = createIntentMcpAdapter({mode, instances: {main: intent}}), session = adapter.connect({protocolVersion: '2025-11-25'});
    try {
      assert.deepEqual(adapter.tools.map(t => t.name), names[mode]);
      for (const suffix of ['parse', 'prepare', 'accept', 'cancel']) {
        assert.equal(await session.callTool('intent_' + suffix, {}), undefined);
        assert.equal(await session.callTool('intent_runtime_intent_' + suffix, {}), undefined);
      }
      for (const name of names[mode]) assert.equal(await session.callTool(name + '_extra', {}), undefined);
      assert.equal((await session.callTool(names[mode][0]!, {}))!.isError, true);
      await session.close();
      assert.equal(await session.callTool('intent_' + (mode === 'host' ? 'prepare' : 'parse'), {}), undefined);
    } finally {await adapter.close(); await intent.dispose();}
  });

  for (const prefix of ['orders_', 'tenant.-_']) test('MCP ' + mode + ' prepends ' + prefix + ' to complete base names', async () => {
    const candidate = draft(); candidate.observations = [observation('orderId', '000123')];
    const intent = new Intent({schema: {type: 'object', properties: {orderId: {type: 'string'}}}, executor: controlled(() => candidate)});
    const adapter = createIntentMcpAdapter({mode, toolPrefix: prefix, instances: {main: intent}}), session = adapter.connect({protocolVersion: '2025-11-25'});
    try {
      assert.deepEqual(adapter.tools.map(t => t.name), names[mode].map(name => prefix + name));
      for (const name of names[mode]) assert.equal(await session.callTool(name, {}), undefined);
      const result = await recognize(session, mode, prefix);
      assert.equal(result.effective.intents[0]!.inputs.orderId, '000123');
      if (mode === 'host') {
        const task = content(await session.callTool(prefix + 'intent_runtime_prepare', {input: 'stop'})) as unknown as HostTask;
        assert.equal(content(await session.callTool(prefix + 'intent_runtime_cancel', {requestId: task.requestId})).status, 'cancelled');
      }
    } finally {await adapter.close(); await intent.dispose();}
  });

  test('MCP ' + mode + ' enforces the final 128-character name boundary', async () => {
    const intent = new Intent({executor: controlled(() => draft())});
    const maxPrefix = 128 - Math.max(...names[mode].map(name => name.length));
    try {
      for (const length of [0, maxPrefix]) {
        const adapter = createIntentMcpAdapter({mode, toolPrefix: 'x'.repeat(length), instances: {main: intent}});
        try {
          assert.equal(Math.max(...adapter.tools.map(t => t.name.length)), length + 128 - maxPrefix);
          const session = adapter.connect({protocolVersion: '2025-11-25'});
          content(await session.callTool(adapter.tools[0]!.name, {input: 'query'}));
        }
        finally {await adapter.close();}
      }
      for (const prefix of ['x'.repeat(maxPrefix + 1), 'x/y', 'x y', '中文']) {
        assert.throws(() => createIntentMcpAdapter({mode, toolPrefix: prefix, instances: {main: intent}}), {code: 'CONFIG_INVALID', stage: 'transport'});
      }
    } finally {await intent.dispose();}
  });

  test('MCP ' + mode + ' uses instance selection without adding tool sets or mixing schemas', async () => {
    const candidate = draft(); candidate.observations = [observation('orderId', '000123')];
    const first = new Intent({schema: {type: 'object', properties: {orderId: {type: 'string', const: '000123'}}}, executor: controlled(() => candidate)});
    const second = new Intent({schema: {type: 'object', properties: {orderId: {type: 'number'}}}, executor: controlled(() => candidate)});
    const adapter = createIntentMcpAdapter({mode, instances: {orders: first, numeric: second}}), session = adapter.connect({protocolVersion: '2025-11-25'});
    try {
      assert.deepEqual(adapter.tools.map(t => t.name), names[mode]);
      for (const instance of [undefined, 'missing']) assert.equal((await session.callTool(names[mode][0]!, {input: 'query', ...(instance === undefined ? {} : {instance})}))!.isError, true);
      const one = await recognize(session, mode, '', 'orders'), two = await recognize(session, mode, '', 'numeric');
      assert.equal(one.fieldResults[0]!.status, 'present'); assert.equal(two.fieldResults[0]!.status, 'invalid');
      assert.equal(one.effective.intents[0]!.inputs.orderId, '000123'); assert.deepEqual(two.effective.intents[0]!.inputs, {});
      assert(two.issues.some(issue => issue.code === 'FIELD_VALUE_INVALID'));
      assert.equal((await recognize(session, mode, '', 'orders')).fieldResults[0]!.status, 'present');
    } finally {await adapter.close(); await first.dispose(); await second.dispose();}
  });
}
