import type { Intent } from "../../intent.js";
import type { IntentParseOptions, JSONSchema } from "../../contracts/public.js";
import type { BridgeConfig } from "../../bridge/index.js";

export type IntentMcpAdapterConfig =
  | (BridgeConfig & { mode?: "host"; toolPrefix?: string })
  | { mode: "executor"; instances: Record<string, Intent>; toolPrefix?: string };

export interface IntentMcpToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JSONSchema & { type: "object" };
  readonly outputSchema?: JSONSchema & { type: "object" };
}

export interface IntentMcpToolResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError: boolean;
}

export interface IntentMcpSession {
  /** Unknown exact names return undefined so the host can dispatch them. */
  callTool(name: string, args: unknown, options?: IntentParseOptions): Promise<IntentMcpToolResult | undefined>;
  close(): void;
}

export interface IntentMcpAdapter {
  readonly tools: readonly IntentMcpToolDefinition[];
  connect(): IntentMcpSession;
  close(): void;
}
