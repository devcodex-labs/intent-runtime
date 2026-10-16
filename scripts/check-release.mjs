import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

/** Check local package identity before CI or any registry mutation. */
export function validateRelease(metadata, lock, {refType, tag, ci = false} = {}) {
  if (metadata.name !== '@devcodex/intent-runtime' || !/^2\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(metadata.version)) throw new Error('Publication requires a stable V2 version.');
  if (lock.name !== metadata.name || lock.version !== metadata.version || lock.packages?.['']?.name !== metadata.name || lock.packages?.['']?.version !== metadata.version) throw new Error('Package and lock identity differ.');
  if (ci && refType !== 'tag') throw new Error('Publication requires a version tag.');
  if (refType === 'tag' && tag !== 'v' + metadata.version) throw new Error('Tag and package version differ.');
}

/** Select the current version's authored notes, excluding older releases. */
export function releaseNotes(changelog, version) {
  const lines = changelog.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex(line => line === '## ' + version || line.startsWith('## ' + version + ' —'));
  if (start < 0) throw new Error('Missing changelog section for ' + version);
  const next = lines.findIndex((line, index) => index > start && line.startsWith('## '));
  const body = lines.slice(start + 1, next < 0 ? undefined : next).join('\n').trim();
  if (!body) throw new Error('Empty release notes.');
  return body + '\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const metadata = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
  validateRelease(metadata, lock, {refType: process.env.GITHUB_REF_TYPE, tag: process.env.GITHUB_REF_NAME, ci: process.env.GITHUB_ACTIONS === 'true'});
  const notes = releaseNotes(await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8'), metadata.version);
  if (process.argv[2] === '--notes') process.stdout.write(notes);
  else if (process.argv.length === 2) console.log('Release identity verified: ' + metadata.name + '@' + metadata.version);
  else throw new Error('Usage: node scripts/check-release.mjs [--notes]');
}
