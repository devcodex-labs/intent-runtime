import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, unlink, symlink, access} from 'node:fs/promises';
import path from 'node:path';
import {maintain, type MaintenanceOptions} from '../src/cli/maintenance.js';
import {tableRange} from '../src/cli/toml.js';
import {spawnSync} from 'node:child_process';

async function fixture() {
  const root = await mkdtemp(path.join(process.env.INTENT_TEST_DIR!, 'maintenance-')); process.env.HOME = root; process.env.USERPROFILE = root; process.env.CODEX_HOME = path.join(root, 'codex'); process.env.INTENT_RUNTIME_HOME = path.join(root, 'state');
  await mkdir(process.env.CODEX_HOME); const config = path.join(root, 'host.mjs'); await writeFile(config, "export default {mode:'host',instances:{main:{}}};\n");
  const options: MaintenanceOptions = {command: 'setup', host: 'codex', name: 'intent-runtime', config, packageRoot: process.env.INTENT_PACKAGE_TEST_ROOT!, dryRun: false, repair: false};
  return {root, config, options, codex: path.join(process.env.CODEX_HOME, 'config.toml'), registry: path.join(process.env.INTENT_RUNTIME_HOME, 'registrations.json'), skill: path.join(root, '.agents/skills/intent-runtime/SKILL.md')};
}

test('Explicit setup, repeat setup, read-only doctor and clean preserve user TOML, config and unrelated tools', async () => {
  const f = await fixture(), original = '# 用户注释\r\nmodel = "gpt-test"\r\n[mcp_servers.other]\r\ncommand = "other"\r\n'; await writeFile(f.codex, original);
  const first = await maintain(f.options); assert.equal(first.exitCode, 0, JSON.stringify(first.report)); assert(first.report.changed);
  const content = await readFile(f.codex, 'utf8'); assert(content.startsWith(original)); assert(!content.replace(/\r\n/g, '').includes('\n'));
  const repeat = await maintain(f.options); assert.equal(repeat.exitCode, 0); assert.equal(repeat.report.changed, false); assert.equal(await readFile(f.codex, 'utf8'), content);
  const doctor = await maintain({...f.options, command: 'doctor', config: undefined} as any); assert.equal(doctor.exitCode, 0); assert.equal(doctor.report.changed, false);
  const cleaned = await maintain({...f.options, command: 'clean', config: undefined} as any); assert.equal(cleaned.exitCode, 0); assert.equal(await readFile(f.codex, 'utf8'), original); assert((await readFile(f.config, 'utf8')).includes('export default'));
  await assert.rejects(access(f.skill)); assert.equal((await maintain({...f.options, command: 'clean'})).report.changed, false);
});

test('Dry-run does not execute a trusted module or create the registration/state/Skill', async () => {
  const f = await fixture(), marker = path.join(f.root, 'module-executed');
  await writeFile(f.config, `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'executed'); export default {mode:'host',instances:{main:{}}};`);
  const r = await maintain({...f.options, dryRun: true}); assert.equal(r.exitCode, 0); assert.equal(r.report.status, 'planned'); assert.equal(r.report.changed, false);
  for (const file of [marker, f.codex, f.registry, f.skill]) await assert.rejects(access(file));
});

test('Setup and doctor load an ESM .js configuration from its own project', async () => {
  const f = await fixture(), config = path.join(f.root, 'host.js');
  await writeFile(path.join(f.root, 'package.json'), JSON.stringify({type: 'module'}));
  await writeFile(config, "export default {mode:'host',instances:{main:{}}};\n");
  const options = {...f.options, config};
  try {
    assert.equal((await maintain(options)).exitCode, 0);
    assert.equal((await maintain({...options, command: 'doctor', config: undefined} as any)).exitCode, 0);
  } finally {await maintain({...options, command: 'clean', config: undefined} as any);}
});

test('User edits to the owned table and Skill are protected for setup, repair and clean', async () => {
  const f = await fixture(); assert.equal((await maintain(f.options)).exitCode, 0);
  const initial = await readFile(f.codex, 'utf8'); const edited = initial.replace('command = ', '# user changed\ncommand = '); await writeFile(f.codex, edited);
  for (const command of ['setup', 'doctor', 'clean'] as const) {const r = await maintain({...f.options, command, repair: command === 'doctor'}); assert.equal(r.exitCode, 3); assert.equal(await readFile(f.codex, 'utf8'), edited);}
  await writeFile(f.codex, initial); const skill = await readFile(f.skill, 'utf8'); await writeFile(f.skill, skill + '\n用户调整\n'); assert.equal((await maintain({...f.options, command: 'clean'})).exitCode, 3); assert((await readFile(f.skill, 'utf8')).includes('用户调整'));
});

test('Doctor repair restores only recorded missing items and preserves unrelated additions', async () => {
  const f = await fixture(); assert.equal((await maintain(f.options)).exitCode, 0);
  const content = await readFile(f.codex, 'utf8'), range = tableRange(content, 'intent-runtime')!;
  await writeFile(f.codex, content.slice(0, range.start) + content.slice(range.end) + '[mcp_servers.user]\ncommand="user"\n'); await unlink(f.skill);
  assert.equal((await maintain({...f.options, command: 'doctor'})).exitCode, 3);
  const repaired = await maintain({...f.options, command: 'doctor', repair: true}); assert.equal(repaired.exitCode, 0); assert(repaired.report.changed); assert((await readFile(f.codex, 'utf8')).includes('command="user"')); await access(f.skill);
});

test('A live maintenance lock is never deleted by a competing command', async () => {
  const f = await fixture(), lock = path.join(process.env.INTENT_RUNTIME_HOME!, '.maintenance-lock'); await mkdir(lock, {recursive: true}); await writeFile(path.join(lock, 'owner.json'), JSON.stringify({pid: process.pid}));
  assert.equal((await maintain(f.options)).exitCode, 3); assert.deepEqual(JSON.parse(await readFile(path.join(lock, 'owner.json'), 'utf8')), {pid: process.pid});
});

test('Failure halfway through setup rolls back owned changes and retains user material', async () => {
  const f = await fixture(), original = '# keep me\nmodel="test"\n'; await writeFile(f.codex, original);
  const r = await maintain(f.options, async index => {if (index === 1) throw new Error('Injected write failure');});
  assert.equal(r.exitCode, 1); assert.equal(r.report.changed, false); assert.equal(await readFile(f.codex, 'utf8'), original); await assert.rejects(access(f.skill)); await assert.rejects(access(f.registry));
});

test('Rollback preserves concurrent user edits outside the owned block', async () => {
  const f = await fixture(); await writeFile(f.codex, '# original\n');
  const r = await maintain(f.options, async index => {if (index === 0) {await writeFile(f.codex, (await readFile(f.codex, 'utf8')) + '\n[mcp_servers.user]\ncommand="user"\n'); throw new Error('Injected failure after user edit');}});
  assert.equal(r.exitCode, 1); const text = await readFile(f.codex, 'utf8'); assert(text.includes('[mcp_servers.user]')); assert.equal(tableRange(text, 'intent-runtime'), undefined);
});

test('Unknown symlink targets and ambiguous inline registration layouts are protection conflicts', async () => {
  const f = await fixture(), target = path.join(f.root, 'user-secret.toml'); await writeFile(target, '# untouched');
  await symlink(target, f.codex); assert.equal((await maintain(f.options)).exitCode, 3); assert.equal(await readFile(target, 'utf8'), '# untouched'); await unlink(f.codex);
  await writeFile(f.codex, 'mcp_servers = { "intent-runtime" = { command = "other" } }\n'); assert.equal((await maintain(f.options)).exitCode, 3);
});

test('Maintenance CLI JSON argument errors stay machine readable without importing configuration', () => {
  const cli = path.join(process.env.INTENT_PACKAGE_TEST_ROOT!, 'dist/cli/index.js');
  for (const args of [['doctor', '--host', 'claude', '--json'], ['doctor', '--host', 'codex', '--dry-run', '--json'], ['setup', '--host', 'codex', '--unknown', '--json']]) {
    const r = spawnSync(process.execPath, [cli, ...args], {encoding: 'utf8'}); assert.equal(r.status, 2); const report = JSON.parse(r.stdout); assert.equal(report.command, args[0]); assert.equal(report.status, 'failed'); assert.equal(report.changed, false);
  }
});

test('Maintenance CLI missing configuration exits 2 with the fixed JSON report', async () => {
  const f = await fixture(), cli = path.join(process.env.INTENT_PACKAGE_TEST_ROOT!, 'dist/cli/index.js');
  const r = spawnSync(process.execPath, [cli, 'setup', '--host', 'codex', '--config', path.join(f.root, 'missing.mjs'), '--json'], {encoding: 'utf8'}); assert.equal(r.status, 2); assert.equal(JSON.parse(r.stdout).status, 'failed');
});

test('Both installed CLI versions follow the package metadata exactly', async () => {
  const root = process.env.INTENT_PACKAGE_TEST_ROOT!, metadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  for (const name of ['index.js', 'mcp.js']) {const r = spawnSync(process.execPath, [path.join(root, 'dist/cli', name), '--version'], {encoding: 'utf8'}); assert.equal(r.status, 0); assert.equal(r.stdout.trim(), metadata.version);}
});
