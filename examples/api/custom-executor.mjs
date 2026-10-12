import { Intent } from "@devcodex/intent-runtime";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { sampleInput, orderSchema } from "../shared/instances.mjs";
import { fixtureReply } from "../shared/candidate-driver.mjs";

const fixture = process.argv.includes("--fixture");
let generateText;
if (fixture) generateText = async request => (await fixtureReply(request)).text;
else {
  const driver = process.env.INTENT_MODEL_DRIVER;
  if (!driver) throw new Error("Set INTENT_MODEL_DRIVER to a trusted module exporting generateText, or explicitly select --fixture.");
  generateText = (await import(pathToFileURL(resolve(driver)).href)).generateText;
  if (typeof generateText !== "function") throw new Error("The trusted module must export generateText(request).");
}
/** @type {import("@devcodex/intent-runtime").ModelExecutor} */
const executor = {
  id: "example:custom-model-function",
  capabilities: { nativeJsonSchema: false, nativeJsonObject: false, isolatedTurn: true, supportsAbort: true },
  async generate(request) {
    const value = await generateText({ instructions: request.instructions, payload: request.payload, format: request.format, signal: request.signal, stage: request.stage });
    if (typeof value === "string") return { outcome: "complete", text: value };
    if (value?.outcome === "refusal" || value?.outcome === "incomplete") return { outcome: value.outcome };
    throw new Error("generateText must return complete JSON text or a refusal/incomplete outcome.");
  },
};
const intent = new Intent({ schema: orderSchema, executor });
try { console.log(JSON.stringify(await intent.parse({ input: sampleInput, fields: ["orderId"], context: "Only inspect the requested order." }), null, 2)); }
catch (error) { console.error(JSON.stringify(error.toJSON?.() ?? { message: "Custom executor failed." })); process.exitCode = 1; }
finally { intent.dispose(); }
