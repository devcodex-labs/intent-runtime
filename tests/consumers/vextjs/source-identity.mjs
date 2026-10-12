import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export const sourceCommit = "2458a718179d58e8fabc6e5577f58e4da6be6f1e";
export const expectedSourceDigest = "8b96619649533552494989c24bf2181b446390b6cddaa145072820fb666f4e92";
export async function verifySource(root) {
  const names = ["LICENSE", "package.json", "package-lock.json"];
  async function visit(dir) {
    for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
      assert.ok(!entry.isSymbolicLink(), "Source identity excludes symlink traversal.");
      const name = dir + "/" + entry.name;
      if (entry.isDirectory()) await visit(name);
      else if (entry.isFile()) names.push(name);
    }
  }
  await visit("src");
  const hash = createHash("sha256");
  for (const name of names.sort()) hash.update(name + "\0").update(await readFile(join(root, name))).update("\0");
  const digest = hash.digest("hex");
  assert.equal(digest, expectedSourceDigest, "Vext source does not match the fixed consumer baseline.");
  return { commit: sourceCommit, sourceTreeSha256: digest, files: names.length };
}
