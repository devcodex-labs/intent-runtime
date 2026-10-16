import test from 'node:test';
import assert from 'node:assert/strict';
import {publicationAction,registryVersion,waitForRegistry} from './release-registry.mjs';

const expected = {name:'@devcodex/intent-runtime',version:'2.0.0',integrity:'sha512-example'};
test('a new version publishes and an identical existing artifact can resume safely', () => {
  assert.equal(publicationAction(undefined,expected),'publish');
  assert.equal(publicationAction({...expected,dist:{integrity:expected.integrity}},expected),'skip');
});
test('an existing version with different bytes or identity is never republished', () => {
  for (const value of [{...expected,dist:{integrity:'sha512-other'}},{...expected,version:'2.0.1',dist:{integrity:expected.integrity}},{...expected}]) assert.throws(() => publicationAction(value,expected),/do not republish/);
});
test('registry 404 is distinct from an outage or authentication failure', async () => {
  let url;
  assert.equal(await registryVersion(expected.name,expected.version,async target => {url=target;return new Response('',{status:404});}),undefined);
  assert.equal(url,'https://registry.npmjs.org/%40devcodex%2Fintent-runtime/2.0.0');
  for (const status of [401,403,429,500]) await assert.rejects(registryVersion(expected.name,expected.version,async()=>new Response('',{status})),/Registry lookup failed/);
  const value = {...expected,dist:{integrity:expected.integrity}};
  assert.deepEqual(await registryVersion(expected.name,expected.version,async()=>Response.json(value)),value);
});

test('post-publish verification waits for both version and default-tag propagation', async () => {
  const current = {...expected,dist:{integrity:expected.integrity}};
  let versionReads = 0, latestReads = 0, waits = 0;
  const result = await waitForRegistry(expected,{wait:async()=>{waits++;},lookup:async(name,version)=>{
    assert.equal(name,expected.name);
    if (version === expected.version) return ++versionReads === 1 ? undefined : current;
    latestReads++; return latestReads === 1 ? {...current,version:'1.0.2'} : current;
  }});
  assert.equal(result.latest,current); assert.equal(waits,2); assert.equal(versionReads,3);
});

test('post-publish verification has a bounded wait and never moves the default tag', async () => {
  let reads = 0, waits = 0;
  await assert.rejects(waitForRegistry(expected,{lookup:async()=>{reads++;return undefined;},wait:async()=>{waits++;}}),/did not become visible/);
  assert.equal(reads,12); assert.equal(waits,11);
});

test('integrity and registry lookup errors fail immediately during propagation', async () => {
  const wait = async()=>{assert.fail('Must not retry a conflicting package or hide a registry error');};
  await assert.rejects(waitForRegistry(expected,{wait,lookup:async()=>({...expected,dist:{integrity:'sha512-other'}})}),/do not republish/);
  await assert.rejects(waitForRegistry(expected,{wait,lookup:async()=>{throw new Error('Registry outage');}}),/Registry outage/);
});
