import type { Intent } from "../../intent.js";
import type { BridgeConfig } from "../../bridge/index.js";
import { createIntentBridge } from "../../bridge/index.js";
import { getRuntime } from "../../core/config.js";
import { IntentParseError, asIntentError, fail } from "../../errors.js";
import { freeze, isObject, onlyKeys } from "../../internal/object.js";
import { readSignalOptions } from "../../internal/signal.js";
import { MCP_TOOLS, EXECUTOR_TOOL, toolDefinitions } from "./definitions.js";
import { dispatchHost, parseToolRequest, toolResult } from "./dispatch.js";
import type { IntentMcpAdapter, IntentMcpAdapterConfig, IntentMcpSession } from "./types.js";

export type { IntentMcpAdapter, IntentMcpAdapterConfig, IntentMcpSession, IntentMcpToolDefinition, IntentMcpToolResult } from "./types.js";

/** SDK-independent registration and dispatch. The caller owns its instances. */
export function createIntentMcpAdapter(config: IntentMcpAdapterConfig): IntentMcpAdapter {
  if (!isObject(config)) fail("CONFIG_INVALID", "config", "Expected MCP adapter configuration.");
  const mode = config.mode === undefined ? "host" : config.mode;
  if (mode !== "host" && mode !== "executor") fail("CONFIG_INVALID", "config", "Unknown MCP adapter mode.");
  onlyKeys(config, mode === "host"
    ? ["mode", "instances", "toolPrefix", "maxJobs", "maxReplayEntries", "maxReplayBytes", "jobTtlMs", "replayTtlMs"]
    : ["mode", "instances", "toolPrefix"], "config", "CONFIG_INVALID");
  for (const key of ["maxJobs", "maxReplayEntries", "maxReplayBytes", "jobTtlMs", "replayTtlMs"]) {
    const value = (config as unknown as Record<string, unknown>)[key];
    if (value !== undefined && typeof value !== "number")
      fail("CONFIG_INVALID", "config", "Bridge capacity and compatibility options must be numbers.");
  }
  if (!isObject(config.instances) || !Object.keys(config.instances).length)
    fail("CONFIG_INVALID", "config", "Adapter needs named Intent instances.");
  const instances = { ...config.instances } as Record<string, Intent>;
  for (const instance of Object.values(instances)) getRuntime(instance);
  const prefix = config.toolPrefix === undefined ? "" : config.toolPrefix;
  if (typeof prefix !== "string" || !/^[A-Za-z0-9_.-]*$/.test(prefix))
    fail("CONFIG_INVALID", "config", "Invalid toolPrefix.");
  const tools = freeze(toolDefinitions(mode, prefix, Object.keys(instances)));
  if (tools.some(tool => tool.name.length > 128)) fail("CONFIG_INVALID", "config", "Tool name exceeds 128 characters.");
  const baseNames = mode === "host" ? MCP_TOOLS.map(tool => tool.name) : [EXECUTOR_TOOL.name];
  const routes = new Map(baseNames.map(name => [prefix + name, name]));
  const bridge = mode === "host" ? createIntentBridge({
    ...Object.fromEntries(Object.entries(config).filter(([key]) => key !== "mode" && key !== "toolPrefix")),
    instances,
  } as BridgeConfig) : undefined;
  const sessions = new Set<IntentMcpSession>();
  let closed = false;
  return {
    tools,
    connect() {
      if (closed) fail("BRIDGE_JOB_NOT_FOUND", "bridge", "Adapter is closed.");
      const connection = bridge?.connect();
      const active = new Set<AbortController>();
      let disconnected = false;
      const session: IntentMcpSession = {
        async callTool(name, args, options) {
          const base = routes.get(name);
          if (!base) return undefined;
          const errorResult = (cause: unknown) => {
            const error = asIntentError(cause, "bridge").toJSON();
            return toolResult(mode === "host" ? { kind: "error", error } : error, true);
          };
          if (closed || disconnected) return errorResult(new IntentParseError("BRIDGE_JOB_NOT_FOUND", "bridge", "Adapter session is closed."));
          try {
            if (connection) {
              const reply = await dispatchHost(connection, base, args, options);
              return toolResult(reply, reply.kind === "error");
            }
            const { intent, request } = parseToolRequest(instances, args);
            const signal = readSignalOptions(options, "bridge");
            const controller = new AbortController();
            const cancel = () => controller.abort();
            active.add(controller);
            signal?.addEventListener("abort", cancel, { once: true });
            if (signal?.aborted) cancel();
            try { return toolResult(await intent.parse(request, { signal: controller.signal }), false); }
            finally {
              signal?.removeEventListener("abort", cancel);
              active.delete(controller);
            }
          } catch (cause) { return errorResult(cause); }
        },
        close() {
          if (disconnected) return;
          disconnected = true;
          for (const controller of active) controller.abort();
          connection?.close();
          sessions.delete(session);
        },
      };
      sessions.add(session);
      return session;
    },
    close() {
      if (closed) return;
      closed = true;
      for (const session of [...sessions]) session.close();
      bridge?.close();
    },
  };
}
