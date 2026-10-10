import { readdir } from "node:fs/promises";
import { join } from "node:path";

export async function documentationFiles(root) {
  async function walk(dir) {
    const result = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === "public") continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) result.push(...await walk(path));
      else if (/\.mdx?$/.test(path)) result.push(path);
    }
    return result.sort();
  }
  return [join(root, "README.md"), ...await walk(join(root, "website/content"))];
}

// Read both CommonMark fence styles; do not inspect apparent fences inside a
// different block. Longer closing fences and CRLF documents are supported.
export function codeBlocks(source) {
  const lines = source.split(/\r?\n/), blocks = [];
  for (let index = 0; index < lines.length; index++) {
    const opening = /^ {0,3}(`{3,}|~{3,})([^`~]*)$/.exec(lines[index]);
    if (!opening) continue;
    const fence = opening[1], language = opening[2].trim().split(/\s+/)[0].toLowerCase();
    const closing = new RegExp(`^ {0,3}${fence[0]}{${fence.length},}[ \\t]*$`);
    let end = index + 1;
    while (end < lines.length && !closing.test(lines[end])) end++;
    if (end === lines.length) throw new Error(`Unclosed Markdown fence at line ${index + 1}`);
    const preceding = lines.slice(0, index).join("\n");
    const label = /<!-- ([\w-]+): ([\w-]+) -->\s*$/.exec(preceding);
    blocks.push({ language: language === "javascript" ? "js" : language, code: lines.slice(index + 1, end).join("\n"), line: index + 2, annotation: label ? { kind: label[1], name: label[2] } : undefined });
    index = end;
  }
  return blocks;
}
