#!/usr/bin/env node
import { context } from "./environment.js";
import { diagnostic } from "./files.js";

const args = process.argv.slice(2);
const command = args.shift();
const json = args.includes("--json");
if (!command || command === "--help") {
  console.log("intent-runtime doctor [--json] [--repair]\nintent-runtime clean [--json]\nGlobal npm installation automatically configures supported clients.");
} else if (!["doctor", "clean"].includes(command) || args.some(a => !["--json", "--repair"].includes(a)) || (command === "clean" && args.includes("--repair"))) {
  console.error("Usage: intent-runtime doctor [--json] [--repair] | clean [--json]");
  process.exitCode = 2;
} else {
  try {
    const { install, doctor, clean } = await import("./installer.js");
    const ctx = context();
    if (command === "doctor" && args.includes("--repair")) await install(ctx);
    const result = command === "clean" ? await clean(ctx) : await doctor(ctx);
    if (json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log("intent-runtime: " + result.status);
      for (const check of result.checks) console.log((check.ok ? "OK " : "FAIL ") + check.name + ": " + check.detail);
      for (const warning of result.warnings) console.log("NOTICE " + warning);
      console.log("State: " + result.statePath);
    }
    if (result.status === "unhealthy" || result.status === "partial") process.exitCode = 1;
  } catch (error) {
    const e = diagnostic(error);
    if (json) console.log(JSON.stringify({ status: "failed", ...e }));
    else console.error(e.code + ": " + e.message);
    process.exitCode = 1;
  }
}
