import assert from 'node:assert/strict';

// The existing tools below are routing fixtures, not capability-graph API names.
// Intent tools still use the installed adapter, core and real business Validator.
export async function verifyMcpCoexistence({Intent, attachIntentTools, candidate}) {
  const checks = [], definition = name => ({name, description: 'Existing server routing fixture.', inputSchema: {type: 'object', properties: {query: {type: 'string'}}, additionalProperties: false}});
  let tools = [definition('cg_lookup'), definition('ping')], generated = 0;
  const calls = [], originalError = new Error('Existing handler failure');
  const original = {
    async listTools() {return tools;},
    async callTool(name, args, options) {
      calls.push({name, args, options});
      if (name === 'cg_failure' || !tools.some(tool => tool.name === name)) throw originalError;
      return {content: [{type: 'text', text: 'Existing handler: ' + name}], isError: false};
    },
  };
  const intent = new Intent({schema: {type: 'object', properties: {orderId: {type: 'string'}}}, executor: {
    id: 'coexistence-language-candidate', async generate() {generated++; return {outcome: 'complete', text: JSON.stringify(candidate)};},
  }});
  const connection = {protocolVersion: '2025-11-25'};
  const config = {mode: 'host', instances: {orders: intent}, toolPrefix: 'ir_'};
  let attached;
  async function rejectsAttachment(expected) {
    let unexpected;
    try {await assert.rejects((async () => {unexpected = await attachIntentTools(original, config, connection);})(), expected);}
    finally {await unexpected?.close();}
  }
  try {
    tools = [definition('cg_lookup'), definition('cg_lookup')];
    await rejectsAttachment(/Duplicate MCP tool name: cg_lookup/);
    checks.push('duplicate original tool names rejected before attachment');

    tools = [definition('ir_intent_prepare')];
    await rejectsAttachment(/Duplicate MCP tool name: ir_intent_prepare/);
    const renamed = await attachIntentTools(original, {...config, toolPrefix: 'ir2_'}, connection);
    try {assert.deepEqual((await renamed.listTools()).map(tool => tool.name), ['ir_intent_prepare', 'ir2_intent_prepare', 'ir2_intent_accept', 'ir2_intent_cancel']);}
    finally {await renamed.close();}
    checks.push('cross-module collision rejected; a distinct prefix resolves it');

    tools = [definition('cg_lookup'), definition('ping')];
    attached = await attachIntentTools(original, config, connection);
    const merged = await attached.listTools();
    assert.deepEqual(merged.map(tool => tool.name), ['cg_lookup', 'ping', 'ir_intent_prepare', 'ir_intent_accept', 'ir_intent_cancel']);
    assert.deepEqual(merged.slice(0, 2), tools);
    assert.equal(tools.length, 2);
    checks.push('existing descriptors preserved in one merged tool list');

    const args = {query: 'provided material'}, options = {signal: new AbortController().signal};
    assert.equal((await attached.callTool('cg_lookup', args, options)).content[0].text, 'Existing handler: cg_lookup');
    assert.equal(calls.at(-1).args, args); assert.equal(calls.at(-1).options, options);
    tools.push(definition('ir_intent_prepare_extra'));
    await attached.callTool('ir_intent_prepare_extra', args, options);
    assert.equal(calls.at(-1).name, 'ir_intent_prepare_extra');
    checks.push('unmatched and similar-prefix names retain original arguments and routing');

    const previousCalls = calls.length;
    const prepared = await attached.callTool('ir_intent_prepare', {input: 'Query order 000123', fields: ['orderId']});
    assert.equal(prepared.isError, false);
    const {requestId, submissionToken} = prepared.structuredContent;
    const accepted = await attached.callTool('ir_intent_accept', {requestId, submissionToken, candidateText: JSON.stringify(candidate)});
    assert.equal(accepted.isError, false);
    assert.equal(accepted.structuredContent.effective.intents[0].inputs.orderId, '000123');
    assert.equal(generated, 0); assert.equal(calls.length, previousCalls);
    assert.equal((await attached.callTool('ir_intent_accept', {})).isError, true);
    assert.equal(calls.length, previousCalls);
    checks.push('host handoff validates real fields; matched failures never fall through');

    tools.push(definition('cg_failure'));
    await assert.rejects(attached.callTool('cg_failure', {}), error => error === originalError);
    await assert.rejects(attached.callTool('unknown_tool', {}), error => error === originalError);
    checks.push('existing failures and unknown-tool policy remain with the original handler');

    tools.push(definition('ir_intent_cancel'));
    await assert.rejects(attached.listTools(), /Duplicate MCP tool name: ir_intent_cancel/);
    const beforeCollisionCall = calls.length;
    await assert.rejects(attached.callTool('cg_lookup', {}), /Duplicate MCP tool name: ir_intent_cancel/);
    assert.equal(calls.length, beforeCollisionCall);
    tools.pop();
    tools.push(definition('cg_lookup'));
    await assert.rejects(attached.listTools(), /Duplicate MCP tool name: cg_lookup/);
    await assert.rejects(attached.callTool('cg_lookup', {}), /Duplicate MCP tool name: cg_lookup/);
    tools.pop();
    tools.push(definition('cg_late'));
    assert((await attached.listTools()).some(tool => tool.name === 'cg_late'));
    await attached.callTool('cg_late', {});
    checks.push('dynamic duplicates reject both listing and calls; valid additions remain usable');

    await attached.close(); attached = undefined;
    assert.equal((await intent.parse({input: 'Query order 000123', fields: ['orderId']})).effective.intents[0].inputs.orderId, '000123');
    const executor = await attachIntentTools(original, {...config, mode: 'executor'}, connection);
    try {
      assert((await executor.listTools()).some(tool => tool.name === 'ir_intent_parse'));
      const beforeExecutorCall = calls.length;
      assert.equal((await executor.callTool('ir_intent_parse', {input: 'Query order 000123', fields: ['orderId']})).structuredContent.effective.intents[0].inputs.orderId, '000123');
      assert.equal((await executor.callTool('ir_intent_parse', {})).isError, true);
      assert.equal(calls.length, beforeExecutorCall);
    } finally {await executor.close();}
    checks.push('closing the helper preserves caller-owned Intent; executor routing also works');
    return {checks, languageCandidatesControlled: true, realCapabilityGraphIntegration: false};
  } finally {try {await attached?.close();} finally {await intent.dispose();}}
}
