import {isAbsolute, extname} from 'node:path';

// Trusted executable configuration follows Node's ESM rules. TypeScript is
// compiled by the caller; the CLI never installs or enables a loader implicitly.
export function isConfigurationPath(value: unknown): value is string {
  return typeof value === 'string' && isAbsolute(value) && ['.js', '.mjs'].includes(extname(value));
}
