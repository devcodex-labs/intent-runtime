import metadata from "../package.json";

export const base = "/intent-runtime/";
export const siteUrl = "https://devcodex-labs.github.io/intent-runtime";
export const repository = "https://github.com/devcodex-labs/intent-runtime";
// Documentation follows the API version; the runtime reports the exact package version.
export const version = metadata.version.split("-")[0];
