import { Intent } from "../dist/index.js";
import { serveIntentMcp } from "../dist/transports/mcp/index.js";

// Test worker only: explicit limits are passed by the protocol harness.
const options = JSON.parse(process.argv[2] ?? "{}");
const intent = new Intent(options.instance ?? {});
await serveIntentMcp({ instances: { test: intent }, ...options.bridge });
