// Internal shared names for registration, exact routing and CLI diagnostics.
export const MCP_TOOL_NAMES = Object.freeze({
  parse: 'intent_runtime_parse',
  prepare: 'intent_runtime_prepare',
  accept: 'intent_runtime_accept',
  cancel: 'intent_runtime_cancel',
});
export const MCP_TOOL_NAMES_BY_MODE = Object.freeze({
  executor: Object.freeze([MCP_TOOL_NAMES.parse]),
  host: Object.freeze([MCP_TOOL_NAMES.prepare, MCP_TOOL_NAMES.accept, MCP_TOOL_NAMES.cancel]),
});
