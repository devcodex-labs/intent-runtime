import { loadCases, instanceName } from "./cases.mjs";
import { SCHEMA_PRESETS } from "./schemas.mjs";
const instances = {};
for (const test of loadCases()) {
  if (!Object.hasOwn(SCHEMA_PRESETS, test.schemaPreset))
    throw new Error("Unknown schema preset.");
  const schema = SCHEMA_PRESETS[test.schemaPreset];
  instances[instanceName(test)] = {
    language: test.language,
    ...(schema ? { schema } : {}),
  };
}
export default { instances };
