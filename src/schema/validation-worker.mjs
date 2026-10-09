import { parentPort, workerData } from "node:worker_threads";
import { Validator } from "schema-dsl/pure";

const validator = new Validator({
  allErrors: true, useDefaults: false, coerceTypes: false, removeAdditional: false,
  cache: { enabled: true, maxSize: workerData.cacheSize },
});
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const escapeKey = key => key.replace(/~/g, "~0").replace(/\//g, "~1");
function descriptions(original, native, data) {
  const paths = new Set();
  function walk(source, compiled, value, path) {
    if (!object(source)) return;
    if (source.description) paths.add(path);
    if (object(value)) for (const [key, child] of Object.entries(value)) {
      if (object(source.properties) && Object.hasOwn(source.properties, key))
        walk(source.properties[key], object(compiled.properties) && Object.hasOwn(compiled.properties, key) ? compiled.properties[key] : compiled.patternProperties?.["^__proto__$"], child, path + "/" + escapeKey(key));
      else if (object(source.additionalProperties))
        walk(source.additionalProperties, compiled.additionalProperties, child, path + "/" + escapeKey(key));
    }
    if (object(source.items) && Array.isArray(value))
      value.forEach((child, index) => walk(source.items, compiled.items, child, path + "/" + index));
    for (const keyword of ["allOf", "anyOf", "oneOf"])
      if (Array.isArray(source[keyword])) source[keyword].forEach((branch, index) => {
        const nativeBranch = compiled[keyword][index];
        if (keyword === "allOf" || validator.validate(nativeBranch, value, { coerce: false, smartCoerce: false, format: false }).valid)
          walk(branch, nativeBranch, value, path);
      });
  }
  walk(original, native, data, "/data");
  return [...paths];
}
parentPort.on("message", ({ id, schema, original, data }) => {
  try {
    const result = validator.validate(schema, data, { coerce: false, smartCoerce: false, format: false });
    parentPort.postMessage({ id, valid: result.valid, descriptionPaths: descriptions(original, schema, data) });
  } catch {
    parentPort.postMessage({ id, failed: true });
  }
});
