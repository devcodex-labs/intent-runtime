import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRelease, releaseNotes} from './check-release.mjs';

const metadata = {name:'@devcodex/intent-runtime',version:'2.0.0'};
const lock = {name:metadata.name,version:metadata.version,packages:{'':metadata}};
test('a matching tag needs no manually maintained acceptance coordinates', () => {
  assert.doesNotThrow(() => validateRelease(metadata,lock,{refType:'tag',tag:'v2.0.0',ci:true}));
});
for (const tag of ['v1.0.2','v2.0.1','2.0.0','v2.0.0-beta.1']) test('reject wrong tag ' + tag, () => {
  assert.throws(() => validateRelease(metadata,lock,{refType:'tag',tag,ci:true}), /Tag and package/);
});
for (const version of ['2.0.0-dev.0','2.01.0','1.0.2','3.0.0']) test('reject unsupported release identity ' + version, () => {
  assert.throws(() => validateRelease({...metadata,version},lock), /stable V2/);
});
test('reject CI publication from a branch and mismatching lock identities', () => {
  assert.throws(() => validateRelease(metadata,lock,{refType:'branch',ci:true}), /version tag/);
  for (const changed of [{...lock,version:'1.0.2'},{...lock,packages:{'':{...metadata,version:'1.0.2'}}}]) assert.throws(() => validateRelease(metadata,changed), /lock identity/);
});
test('release notes select exactly one version and support checkout line endings', () => {
  const text = '# Changelog\n\n## 2.0.0\n\n- New HTTP.\n\n## 1.0.2\n\n- Old API.\n';
  assert.equal(releaseNotes(text,'2.0.0'),'- New HTTP.\n');
  assert.equal(releaseNotes(text.replaceAll('\n','\r\n'),'2.0.0'),'- New HTTP.\n');
  assert.throws(() => releaseNotes(text,'2.0.1'),/Missing/);
  assert.throws(() => releaseNotes('## 2.0.0\n\n## 1.0.2\nold','2.0.0'),/Empty/);
});
