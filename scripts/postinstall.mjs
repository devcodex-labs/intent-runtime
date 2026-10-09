// This entry exists before a source checkout is built. Local installs exit
// before importing dist, while published direct global installs initialize.
import { realpathSync, lstatSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let direct = false;
if (process.env.npm_config_global === "true" && process.env.npm_config_prefix) {
  const target = join(process.env.npm_config_prefix, ...(process.platform === "win32" ? [] : ["lib"]), "node_modules", "@devcodex-labs", "intent-runtime");
  try {
    const canonical = p => process.platform === "win32" ? realpathSync(p).toLowerCase() : realpathSync(p);
    direct = !lstatSync(target).isSymbolicLink() && canonical(target) === canonical(root);
  } catch { /* Not a directly installed global module. */ }
}
if (direct && process.env.INTENT_RUNTIME_SKIP_AUTO_CONFIG !== "1") {
  if (Number(process.versions.node.split(".")[0]) < 20) {
    console.error("intent-runtime requires Node.js >=20.0.0.");
    process.exitCode = 1;
  } else {
    try { await import("../dist/installation/postinstall.js"); }
    catch { console.error("intent-runtime initialization entry is missing or cannot load; check the installed package and dependencies."); process.exitCode = 1; }
  }
}
