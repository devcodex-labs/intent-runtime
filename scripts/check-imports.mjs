import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
const files = [];
async function walk(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const file = path.posix.join(dir, item.name);
    if (item.isDirectory()) await walk(file);
    else if (file.endsWith(".ts")) files.push(file);
  }
}
await walk("src");
const graph = new Map();
for (const file of files) {
  const content = await readFile(file, "utf8");
  const deps = [];
  for (const match of content.matchAll(
    /(?:import|export)\s+(?:type\s+)?[^;]*?from\s+['"]([^'"]+)['"]/g,
  )) {
    const dep = match[1];
    if (
      !file.startsWith("src/adapters/") &&
      !file.startsWith("src/transports/") &&
      /^(openai|@modelcontextprotocol)/.test(dep)
    )
      throw new Error("SDK crossed core boundary: " + file);
    if (
      file.startsWith("src/adapters/") &&
      /\/core\/|\/validation\/|\/intent\.js/.test(dep)
    )
      throw new Error("Adapter depends on core: " + file);
    if (dep.startsWith("."))
      deps.push(
        path.posix
          .normalize(path.posix.join(path.posix.dirname(file), dep))
          .replace(/\.js$/, ".ts"),
      );
  }
  graph.set(file, deps);
}
const active = new Set(),
  done = new Set();
function visit(file) {
  if (active.has(file)) throw new Error("Import cycle: " + file);
  if (done.has(file)) return;
  active.add(file);
  for (const dep of graph.get(file) ?? []) visit(dep);
  active.delete(file);
  done.add(file);
}
for (const file of files) visit(file);
console.log("Import boundaries and static cycles checked.");
