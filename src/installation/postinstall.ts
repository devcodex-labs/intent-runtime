import { context, directGlobal, paths } from "./environment.js";
import { diagnostic } from "./files.js";

const ctx = context();
if (directGlobal(ctx) && ctx.env.INTENT_RUNTIME_SKIP_AUTO_CONFIG !== "1") {
  try {
    const { install } = await import("./installer.js");
    const result = await install(ctx);
    console.log("intent-runtime: " + result.status + "; diagnostics: intent-runtime doctor");
  } catch (error) {
    const e = diagnostic(error);
    console.error("intent-runtime: " + e.code + ": " + e.message + "; logs: " + paths(ctx).log + ". Reinstall after correcting the reported issue.");
    process.exitCode = 1;
  }
}
