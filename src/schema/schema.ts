import { Validator } from "schema-dsl/pure";
import type { JSONSchema, IntentLimits } from "../contracts/public.js";
import { fail } from "../errors.js";
import { bytes, freeze, isObject, pointerKey } from "../internal/object.js";
const DIALECT = "http://json-schema.org/draft-07/schema#";
const keywords = new Set([
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "const",
  "title",
  "description",
  "examples",
  "default",
  "minLength",
  "maxLength",
  "pattern",
  "format",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minItems",
  "maxItems",
  "uniqueItems",
  "anyOf",
  "oneOf",
  "allOf",
  "not",
  "$schema",
  "$comment",
  "$id",
  "exactLength",
  "_label",
  "_customMessages",
]);
const formats = new Set([
  "date",
  "time",
  "date-time",
  "duration",
  "uri",
  "uri-reference",
  "url",
  "email",
  "hostname",
  "ipv4",
  "ipv6",
  "regex",
  "uuid",
  "json-pointer",
  "relative-json-pointer",
]);
const validatorOptions = {
  allErrors: true,
  useDefaults: false,
  coerceTypes: false,
  removeAdditional: false,
};
// AJV excludes __proto__ from generated property checks. Move that literal name
// to an exact pattern internally so its type, required and closed-object rules
// still apply. Public Schemas and model tasks retain the original property.
function nativeSchema(schema: JSONSchema): JSONSchema {
  const result: Record<string, unknown> = { ...schema };
  if (schema.properties) {
    const properties = Object.create(null) as NonNullable<
      JSONSchema["properties"]
    >;
    for (const [name, child] of Object.entries(schema.properties)) {
      const converted = isObject(child) ? nativeSchema(child) : child;
      if (name === "__proto__")
        result.patternProperties = { "^__proto__$": converted };
      else properties[name] = converted;
    }
    result.properties = properties;
  }
  for (const key of [
    "items",
    "additionalProperties",
    "not",
    "anyOf",
    "oneOf",
    "allOf",
  ] as const) {
    const child: unknown = schema[key];
    if (isObject(child)) result[key] = nativeSchema(child);
    else if (Array.isArray(child))
      result[key] = child.map((item) =>
        isObject(item) ? nativeSchema(item) : item,
      );
  }
  return result as JSONSchema;
}
export function snapshotSchema(
  input: unknown,
  limits: IntentLimits,
): JSONSchema {
  if (
    input === undefined ||
    (isObject(input) && Object.keys(input).length === 0)
  )
    return freeze({
      type: "object",
      properties: {},
      additionalProperties: false,
    });
  let propertyCount = 0;
  const visiting = new Set<object>();
  function cloneJson(value: unknown, depth: number): unknown {
    if (depth > 64)
      fail(
        "SCHEMA_UNSUPPORTED",
        "config",
        "Schema annotation nesting is too deep.",
      );
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean"
    )
      return value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "object" || value === null || visiting.has(value))
      fail(
        "SCHEMA_UNSUPPORTED",
        "config",
        "Non-JSON or cyclic Schema metadata is unsupported.",
      );
    visiting.add(value);
    const out: unknown = Array.isArray(value)
      ? value.map((item) => cloneJson(item, depth + 1))
      : (() => {
          if (!isObject(value))
            fail(
              "SCHEMA_UNSUPPORTED",
              "config",
              "Schema metadata must be plain JSON.",
            );
          const result: Record<string, unknown> = Object.create(null) as Record<
            string,
            unknown
          >;
          for (const [key, descriptor] of Object.entries(
            Object.getOwnPropertyDescriptors(value),
          )) {
            if (!("value" in descriptor))
              fail(
                "SCHEMA_UNSUPPORTED",
                "config",
                "Schema accessors are unsupported.",
              );
            result[key] = cloneJson(descriptor.value, depth + 1);
          }
          return result;
        })();
    visiting.delete(value);
    return out;
  }
  // Inspect raw keys and values before cloning: functions and runtime transformations must not disappear.
  function inspect(value: unknown, depth: number, root: boolean): void {
    if (typeof value === "boolean") return;
    if (!isObject(value))
      fail("SCHEMA_UNSUPPORTED", "config", "Expected an object Schema.");
    if (depth > limits.maxSchemaDepth)
      fail("LIMIT_EXCEEDED", "config", "Schema exceeds maxSchemaDepth.");
    if (visiting.has(value))
      fail("SCHEMA_UNSUPPORTED", "config", "Recursive Schema is unsupported.");
    visiting.add(value);
    for (const [key, descriptor] of Object.entries(
      Object.getOwnPropertyDescriptors(value),
    )) {
      if (!("value" in descriptor) || !keywords.has(key))
        fail(
          "SCHEMA_UNSUPPORTED",
          "config",
          "Unsupported Schema keyword or runtime metadata: " + key,
        );
      const child: unknown = descriptor.value;
      if (
        root &&
        ["anyOf", "oneOf", "allOf", "not", "enum", "const"].includes(key)
      )
        fail(
          "SCHEMA_UNSUPPORTED",
          "config",
          "Root value constraints cannot be projected without changing their meaning.",
        );
      if (
        key === "$schema" &&
        child !== DIALECT &&
        child !== "https://json-schema.org/draft-07/schema#"
      )
        fail("SCHEMA_UNSUPPORTED", "config", "Only Draft-7 is supported.");
      if (
        key === "format" &&
        (typeof child !== "string" || !formats.has(child))
      )
        fail("SCHEMA_UNSUPPORTED", "config", "Unsupported format.");
      if (key === "properties") {
        if (!isObject(child))
          fail("SCHEMA_UNSUPPORTED", "config", "properties must be an object.");
        propertyCount += Object.keys(child).length;
        if (propertyCount > limits.maxSchemaProperties)
          fail(
            "LIMIT_EXCEEDED",
            "config",
            "Schema exceeds maxSchemaProperties.",
          );
        for (const descriptor of Object.values(
          Object.getOwnPropertyDescriptors(child),
        )) {
          if (!("value" in descriptor))
            fail(
              "SCHEMA_UNSUPPORTED",
              "config",
              "Schema property accessors are unsupported.",
            );
          inspect(descriptor.value, depth + 1, false);
        }
      } else if (["items", "additionalProperties", "not"].includes(key)) {
        if (Array.isArray(child))
          fail("SCHEMA_UNSUPPORTED", "config", "Tuple items are unsupported.");
        inspect(child, depth + 1, false);
      } else if (["anyOf", "oneOf", "allOf"].includes(key)) {
        if (!Array.isArray(child) || child.length === 0 || child.length > 16)
          fail(
            "SCHEMA_UNSUPPORTED",
            "config",
            "Invalid or excessive Schema combinator.",
          );
        for (const schema of child) inspect(schema, depth + 1, false);
      }
    }
    visiting.delete(value);
  }
  inspect(input, 0, true);
  const schema = cloneJson(input, 0) as JSONSchema;
  if (schema.type !== "object" || !isObject(schema.properties))
    fail(
      "SCHEMA_UNSUPPORTED",
      "config",
      "The root must be an object with properties.",
    );
  function normalize(value: JSONSchema): void {
    if (value.exactLength !== undefined) {
      if (
        !Number.isSafeInteger(value.exactLength) ||
        (value.exactLength as number) < 0
      )
        fail("SCHEMA_UNSUPPORTED", "config", "Invalid exactLength.");
      for (const bound of [value.minLength, value.maxLength]) {
        if (bound !== undefined && (!Number.isSafeInteger(bound) || bound < 0))
          fail("SCHEMA_UNSUPPORTED", "config", "Invalid length bound.");
      }
      value.minLength = Math.max(
        value.exactLength as number,
        value.minLength ?? 0,
      );
      value.maxLength = Math.min(
        value.exactLength as number,
        value.maxLength ?? Infinity,
      );
      delete value.exactLength;
    }
    // Identity/diagnostic metadata must not alter compilation or create global registration collisions.
    delete value.$id;
    delete value._label;
    delete value._customMessages;
    delete value._description;
    delete value._required;
    for (const child of Object.values(value.properties ?? {}))
      if (isObject(child)) normalize(child);
    for (const key of [
      "items",
      "additionalProperties",
      "not",
      "anyOf",
      "oneOf",
      "allOf",
    ] as const) {
      const child: unknown = value[key];
      if (isObject(child)) normalize(child);
      else if (Array.isArray(child))
        for (const item of child) if (isObject(item)) normalize(item);
    }
  }
  normalize(schema);
  if (schema.$schema === "https://json-schema.org/draft-07/schema#")
    schema.$schema = DIALECT;
  if (
    schema.required !== undefined &&
    (!Array.isArray(schema.required) ||
      schema.required.some((name) => typeof name !== "string") ||
      new Set(schema.required).size !== schema.required.length)
  )
    fail(
      "SCHEMA_UNSUPPORTED",
      "config",
      "required must contain unique property names.",
    );
  if (
    (schema.required ?? []).some(
      (name) => !Object.hasOwn(schema.properties!, name),
    )
  )
    fail(
      "SCHEMA_UNSUPPORTED",
      "config",
      "Root required must refer to defined selectable fields.",
    );
  if (bytes(JSON.stringify(schema)) > limits.maxSchemaBytes)
    fail("LIMIT_EXCEEDED", "config", "Schema exceeds maxSchemaBytes.");
  try {
    new Validator(validatorOptions).compile(nativeSchema(schema));
  } catch {
    fail(
      "SCHEMA_UNSUPPORTED",
      "config",
      "Schema cannot be compiled with the supported Draft-7 contract.",
    );
  }
  return freeze(schema);
}
export class SchemaStore {
  readonly schema: JSONSchema;
  private readonly validator: Validator;
  private readonly cache = new Map<
    string,
    { schema: JSONSchema; native: JSONSchema }
  >();
  constructor(
    schema: JSONSchema,
    private readonly limit: number,
  ) {
    this.schema = schema;
    this.validator = new Validator({
      ...validatorOptions,
      cache: { enabled: true, maxSize: limit },
    });
  }
  select(fields: readonly string[] | undefined): string[] {
    const available = Object.keys(this.schema.properties ?? {});
    if (fields === undefined) return available;
    const names = [...new Set(fields)];
    if (names.some((name) => !available.includes(name)))
      fail(
        "UNKNOWN_FIELD",
        "input",
        "Selection includes an undefined top-level field.",
      );
    return names;
  }
  project(names: readonly string[]): JSONSchema {
    const key = JSON.stringify([...names].sort());
    const cached = this.cache.get(key);
    if (cached) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached.schema;
    }
    const properties = Object.create(null) as NonNullable<
      JSONSchema["properties"]
    >;
    for (const name of names) properties[name] = this.schema.properties![name]!;
    const schema: JSONSchema = freeze({
      type: "object",
      properties,
      required: (this.schema.required ?? []).filter((name) =>
        names.includes(name),
      ),
      additionalProperties: false,
    });
    if (this.cache.size >= this.limit)
      this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, { schema, native: freeze(nativeSchema(schema)) });
    return schema;
  }
  validate(names: readonly string[], data: unknown) {
    this.project(names);
    const key = JSON.stringify([...names].sort());
    return this.validator.validate(this.cache.get(key)!.native, data, {
      coerce: false,
      smartCoerce: false,
      format: false,
    });
  }
  descriptions(
    names: readonly string[],
    data: Record<string, unknown>,
  ): string[] {
    const paths: string[] = [];
    if (this.schema.description) paths.push("/data");
    const walk = (schema: unknown, value: unknown, path: string): void => {
      if (!isObject(schema)) return;
      if (schema.description) paths.push(path);
      if (isObject(schema.properties) && isObject(value))
        for (const [key, child] of Object.entries(schema.properties)) {
          if (Object.hasOwn(value, key))
            walk(child, value[key], path + "/" + pointerKey(key));
        }
      if (isObject(schema.items) && Array.isArray(value))
        value.forEach((child, index) =>
          walk(schema.items, child, path + "/" + index),
        );
      for (const key of ["allOf", "anyOf", "oneOf"])
        if (Array.isArray(schema[key]))
          for (const branch of schema[key]) walk(branch, value, path);
    };
    for (const name of names)
      if (Object.hasOwn(data, name))
        walk(
          this.schema.properties![name],
          data[name],
          "/data/" + pointerKey(name),
        );
    return [...new Set(paths)];
  }
  dispose(): void {
    this.cache.clear();
    this.validator.clearCache();
  }
}
