import { readFileSync } from "node:fs";
import { parse, stringify } from "bcp-47";
import { fail } from "../errors.js";
interface RegistryRecord {
  Type: string;
  Subtag?: string;
  Tag?: string;
  "Preferred-Value"?: string;
  Prefix?: string[];
}
interface Registry {
  fileDate: string;
  records: RegistryRecord[];
}
const registry = JSON.parse(
  readFileSync(
    new URL("./data/iana-language-subtags.json", import.meta.url),
    "utf8",
  ),
) as Registry;
const extensionRegistry = JSON.parse(
  readFileSync(
    new URL("./data/iana-language-extensions.json", import.meta.url),
    "utf8",
  ),
) as { identifiers: string[] };
const entries = new Map(
  registry.records.map((record) => [
    record.Type + ":" + (record.Subtag ?? record.Tag ?? "").toLowerCase(),
    record,
  ]),
);
export const LANGUAGE_REGISTRY_DATE = registry.fileDate;
export function normalizeLanguage(input: unknown): string {
  if (input === undefined) return "en";
  const invalid = (): never =>
    fail(
      "CONFIG_INVALID",
      "config",
      "Expected a registered BCP 47 tag specifying an output language (registry " +
        registry.fileDate +
        ").",
    );
  if (
    typeof input !== "string" ||
    !input ||
    input.trim() !== input ||
    input.length > 255
  )
    return invalid();
  const legacy =
    entries.get("grandfathered:" + input.toLowerCase()) ??
    entries.get("redundant:" + input.toLowerCase());
  const tag = legacy?.["Preferred-Value"] ?? input;
  let warning = false;
  const parsed = parse(tag, {
    normalize: false,
    warning: () => {
      warning = true;
    },
  });
  if (warning) return invalid();
  if (!parsed.language) {
    // Registered grandfathered names may lack a preferred modern spelling.
    if (
      legacy &&
      !legacy["Preferred-Value"] &&
      input.toLowerCase() !== "i-default"
    )
      return legacy.Tag!;
    return invalid();
  }
  const lookup = (kind: string, subtag: string): RegistryRecord => {
    const lower = subtag.toLowerCase();
    const exact = entries.get(kind + ":" + lower);
    if (exact) return exact;
    // IANA registers private script/region ranges. A concrete base language
    // remains mandatory; the reserved qaa..qtz language range is not a language.
    if (kind === "script" || kind === "region") {
      for (const record of registry.records) {
        if (record.Type !== kind || !record.Subtag?.includes("..")) continue;
        const [start, end] = record.Subtag.toLowerCase().split("..");
        if (
          start &&
          end &&
          lower.length === start.length &&
          lower >= start &&
          lower <= end
        )
          return record;
      }
    }
    return invalid();
  };
  let language = lookup("language", parsed.language);
  if (["und", "mul", "zxx"].includes(parsed.language.toLowerCase()))
    return invalid();
  parsed.language =
    language["Preferred-Value"] ?? parsed.language.toLowerCase();
  for (const extlang of parsed.extendedLanguageSubtags) {
    const record = lookup("extlang", extlang);
    if (record.Prefix && !record.Prefix.includes(parsed.language.toLowerCase()))
      return invalid();
    if (record["Preferred-Value"]) parsed.language = record["Preferred-Value"];
  }
  parsed.extendedLanguageSubtags = [];
  language = lookup("language", parsed.language);
  if (["und", "mul", "zxx"].includes(language.Subtag ?? "")) return invalid();
  if (parsed.script) {
    const value =
      lookup("script", parsed.script)["Preferred-Value"] ?? parsed.script;
    parsed.script = value[0]!.toUpperCase() + value.slice(1).toLowerCase();
  }
  if (parsed.region)
    parsed.region = (
      lookup("region", parsed.region)["Preferred-Value"] ?? parsed.region
    ).toUpperCase();
  const variants = new Set<string>();
  parsed.variants = parsed.variants.map((value) => {
    const normalized = (
      lookup("variant", value)["Preferred-Value"] ?? value
    ).toLowerCase();
    if (variants.has(normalized)) return invalid();
    variants.add(normalized);
    return normalized;
  });
  const extensions = new Set<string>();
  for (const extension of parsed.extensions) {
    extension.singleton = extension.singleton.toLowerCase();
    if (
      !extensionRegistry.identifiers.includes(extension.singleton) ||
      extensions.has(extension.singleton)
    )
      return invalid();
    extensions.add(extension.singleton);
    extension.extensions = extension.extensions.map((value) =>
      value.toLowerCase(),
    );
  }
  parsed.extensions.sort((a, b) => a.singleton.localeCompare(b.singleton));
  parsed.privateuse = parsed.privateuse.map((value) => value.toLowerCase());
  return stringify(parsed);
}
