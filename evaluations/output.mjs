import { fileURLToPath } from "node:url";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

const projectRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
const defaultRoot = join(
  dirname(projectRoot),
  basename(projectRoot) + "-results",
  "runs",
);

export function externalOutputPath(path) {
  const output = resolve(path);
  const location = relative(projectRoot, output);
  if (
    location === "" ||
    (location !== ".." &&
      !location.startsWith(".." + sep) &&
      !isAbsolute(location))
  )
    throw new Error(
      "Evaluation reports and records must be written outside the project directory.",
    );
  return output;
}

export function evaluationOutput(label, explicitPath) {
  const directory = process.env.INTENT_EVALUATION_DIR ?? defaultRoot;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return externalOutputPath(explicitPath ?? join(directory, timestamp + "-" + label));
}
