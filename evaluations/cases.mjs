import { readFileSync } from "node:fs";
export function loadCases() {
  const result = [];
  for (const dataset of ["semantics", "languages"]) {
    const cases = readFileSync(
      new URL("./cases/" + dataset + ".jsonl", import.meta.url),
      "utf8",
    )
      .trim()
      .split("\n")
      .map(JSON.parse);
    for (const item of cases)
      for (const variant of item.variants ?? [{ name: "default" }]) {
        const test = { ...item, ...variant };
        delete test.variants;
        result.push({
          ...test,
          dataset,
          variant: variant.name,
          key: test.id + "/" + variant.name,
          language: test.language ?? "en",
        });
      }
  }
  if (new Set(result.map((item) => item.key)).size !== result.length)
    throw new Error("Duplicate case key.");
  return result;
}
export const instanceName = (test) => test.schemaPreset + "__" + test.language;
