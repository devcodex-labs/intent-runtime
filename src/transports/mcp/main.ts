#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { Intent } from "../../intent.js";
import type { IntentConfig } from "../../contracts/public.js";
import { isObject } from "../../internal/object.js";
import { serveIntentMcp } from "./index.js";
const owned: Intent[] = [];
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--config" || !args[1])
    throw new Error("Usage: intent-runtime-mcp --config <trusted-config.mjs>");
  const module = (await import(pathToFileURL(resolve(args[1])).href)) as {
    default?: unknown;
  };
  const config = module.default;
  if (
    !isObject(config) ||
    !isObject(config.instances) ||
    !Object.keys(config.instances).length
  )
    throw new Error(
      "Trusted config must export default { instances: { name: IntentConfig } }.",
    );
  const instances: Record<string, Intent> = Object.create(null) as Record<
    string,
    Intent
  >;
  for (const [name, options] of Object.entries(config.instances)) {
    if (options instanceof Intent) instances[name] = options;
    else {
      const intent = new Intent(options as IntentConfig);
      owned.push(intent);
      instances[name] = intent;
    }
  }
  const service = await serveIntentMcp({ instances });
  let closing = false;
  async function close() {
    if (closing) return;
    closing = true;
    await service.close();
    for (const intent of owned) intent.dispose();
  }
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => {
      void close();
    });
  process.stdin.once("end", () => {
    void close();
  });
}
main().catch(() => {
  for (const intent of owned) intent.dispose();
  console.error(
    "intent-runtime MCP startup failed. Check the trusted config path, Node version and dependencies.",
  );
  process.exitCode = 1;
});
