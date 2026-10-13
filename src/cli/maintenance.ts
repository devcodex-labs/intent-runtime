import {readFile, writeFile, rename, unlink, mkdir, rmdir, lstat} from 'node:fs/promises';
import path from 'node:path';
import {homedir} from 'node:os';
import {randomUUID, createHash} from 'node:crypto';
import {ProtectionConflict, tableRange, replaceTable} from './toml.js';
import type {IntentMcpMode} from '../mcp/index.js';

export type MaintenanceReport = {command: 'setup' | 'doctor' | 'clean'; status: 'ok' | 'planned' | 'conflict' | 'failed'; changed: boolean; checks: Array<{name: string; status: 'pass' | 'fail' | 'skipped'; message: string}>; paths: string[]; warnings: string[]};
export interface MaintenanceOptions {command: MaintenanceReport['command']; host: 'codex'; name: string; config?: string; dryRun: boolean; repair: boolean; packageRoot: string}
interface Registration {name: string; config: string; command: string; args: string[]; mode: IntentMcpMode; block: string; separator: string; skill?: string; skillHash?: string; skillText?: string; configFile: string}
interface Change {path: string; before?: string; after?: string; table?: {name: string; separator: string; fileExisted?: boolean}}
interface Journal {changes: Change[]}
const sha = (s: string): string => createHash('sha256').update(s).digest('hex');
const validName = (s: string): boolean => /^[A-Za-z0-9_.-]{1,64}$/.test(s) && !['__proto__', 'prototype', 'constructor'].includes(s);
async function safePath(file: string): Promise<void> {
  const parts = path.resolve(file).split(path.sep); let current = path.parse(file).root;
  for (const part of parts.slice(1)) {
    current = path.join(current, part);
    try {if ((await lstat(current)).isSymbolicLink()) throw new ProtectionConflict();} catch (error) {if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error;}
  }
}
async function read(file: string): Promise<string | undefined> {await safePath(file); try {return await readFile(file, 'utf8');} catch (error) {if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error;}}
async function atomic(file: string, value: string | undefined, expected: string | undefined): Promise<void> {
  if (await read(file) !== expected) throw new ProtectionConflict();
  await safePath(path.dirname(file)); await mkdir(path.dirname(file), {recursive: true});
  if (value === undefined) {if (expected !== undefined) await unlink(file); return;}
  const temp = file + '.intent-runtime-' + randomUUID() + '.tmp';
  let mode = 0o600; try {mode = (await lstat(file)).mode & 0o777;} catch (error) {if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;}
  try {
    await writeFile(temp, value, {flag: 'wx', mode});
    if (await read(file) !== expected) throw new ProtectionConflict();
    await rename(temp, file);
  } finally {await unlink(temp).catch(error => {if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;});}
}
async function apply(change: Change, reverse = false): Promise<void> {
  const expected = reverse ? change.after : change.before, next = reverse ? change.before : change.after;
  if (change.table) {
    const current = await read(change.path), updated = replaceTable(current ?? '', change.table.name, expected, next, change.table.separator);
    tableRange(updated, change.table.name);
    await atomic(change.path, reverse && change.table.fileExisted === false && !updated ? undefined : updated, current);
  } else await atomic(change.path, next, expected);
}
async function rollback(changes: Change[]): Promise<boolean> {
  let safe = true;
  for (const change of [...changes].reverse()) {
    try {
      const current = await read(change.path), part = change.table ? tableRange(current ?? '', change.table.name)?.text : current;
      if (part === change.before) continue;
      if (part !== change.after) {safe = false; continue;}
      await apply(change, true);
    } catch {safe = false;}
  }
  return safe;
}
function registrationBlock(name: string, command: string, args: string[], eol: string): string {
  return '[mcp_servers.' + JSON.stringify(name) + ']' + eol + 'command = ' + JSON.stringify(command) + eol + 'args = ' + JSON.stringify(args) + eol;
}

export async function maintain(options: MaintenanceOptions, onApplied?: (index: number) => Promise<void>): Promise<{report: MaintenanceReport; exitCode: number}> {
  const report: MaintenanceReport = {command: options.command, status: 'ok', changed: false, checks: [], paths: [], warnings: []};
  const check = (name: string, status: 'pass' | 'fail' | 'skipped', message: string) => report.checks.push({name, status, message});
  let lock: string | undefined; let held = false;
  try {
    const home = homedir(), runtime = process.env.INTENT_RUNTIME_HOME ?? path.join(home, '.intent-runtime'), codex = process.env.CODEX_HOME ?? path.join(home, '.codex');
    if (!path.isAbsolute(runtime) || !path.isAbsolute(codex) || !validName(options.name) || options.host !== 'codex') return {report: {...report, status: 'failed'}, exitCode: 2};
    const configFile = path.join(codex, 'config.toml'), registry = path.join(runtime, 'registrations.json'), journalFile = path.join(runtime, 'maintenance-journal.json'), skillFile = path.join(home, '.agents', 'skills', options.name, 'SKILL.md');
    report.paths = [configFile, registry, skillFile];
    for (const file of [...report.paths, journalFile]) await safePath(file);
    const changing = options.command !== 'doctor' || options.repair;
    if (changing && !options.dryRun) {
      await mkdir(runtime, {recursive: true}); lock = path.join(runtime, '.maintenance-lock');
      try {await mkdir(lock);} catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const owner = JSON.parse(await read(path.join(lock, 'owner.json')) ?? 'null') as {pid?: number} | null;
        if (!owner || !Number.isSafeInteger(owner.pid) || owner.pid! <= 0) throw new ProtectionConflict();
        try {process.kill(owner.pid!, 0); throw new ProtectionConflict();} catch (e) {if ((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e;}
        await unlink(path.join(lock, 'owner.json')); await rmdir(lock); await mkdir(lock);
      }
      held = true;
      await writeFile(path.join(lock, 'owner.json'), JSON.stringify({pid: process.pid}), {flag: 'wx', mode: 0o600});
    }
    const leftover = await read(journalFile);
    if (leftover) {
      if (!changing || options.dryRun) throw new ProtectionConflict();
      const journal = JSON.parse(leftover) as Journal;
      if (!Array.isArray(journal.changes) || journal.changes.some(c => ![configFile, registry, skillFile].includes(c.path) || c.table && (c.path !== configFile || c.table.name !== options.name))) throw new ProtectionConflict();
      if (!await rollback(journal.changes)) throw new ProtectionConflict();
      await atomic(journalFile, undefined, leftover); check('recovery', 'pass', 'Recovered the interrupted owned changes.');
    }
    const stateBefore = await read(registry), state = JSON.parse(stateBefore ?? '{}') as Record<string, Registration>;
    if (!state || typeof state !== 'object' || Array.isArray(state)) throw new ProtectionConflict();
    const record = Object.hasOwn(state, options.name) ? state[options.name] : undefined;
    if (record && (record.name !== options.name || record.configFile !== configFile || !path.isAbsolute(record.config) || typeof record.block !== 'string' || !['host', 'executor'].includes(record.mode) || record.skill !== undefined && record.skill !== skillFile || !Array.isArray(record.args))) throw new ProtectionConflict();
    const currentConfig = await read(configFile), table = tableRange(currentConfig ?? '', options.name), currentSkill = await read(skillFile);
    if (record) {
      if (table && table.text !== record.block || record.skill && currentSkill !== undefined && sha(currentSkill) !== record.skillHash) throw new ProtectionConflict();
    } else if (table || currentSkill !== undefined && options.command === 'setup') throw new ProtectionConflict();
    const changes: Change[] = [];
    let nextRecord = record;
    if (options.command === 'setup') {
      if (!options.config || !path.isAbsolute(options.config) || !options.config.endsWith('.mjs')) return {report: {...report, status: 'failed'}, exitCode: 2};
      await safePath(options.config);
      let configExists = false;
      try {configExists = (await lstat(options.config)).isFile();} catch (error) {if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;}
      if (!configExists) {check('configuration', 'fail', 'Select an existing trusted .mjs file.'); return {report: {...report, status: 'failed'}, exitCode: 2};}
      const command = process.execPath, args = [path.join(options.packageRoot, 'dist', 'cli', 'mcp.js'), '--config', options.config];
      let mode = record?.mode;
      if (options.dryRun) check('startup', 'skipped', 'Dry run does not import configuration or start a process.');
      else {const {diagnose} = await import('./diagnose.js'); mode = await diagnose(command, args); check('startup', 'pass', 'Listed the actual MCP tools without calling a model.');}
      const eol = currentConfig?.includes('\r\n') ? '\r\n' : '\n';
      const block = registrationBlock(options.name, command, args, eol), separator = record?.separator ?? (currentConfig?.length ? currentConfig.endsWith('\n') ? eol : eol + eol : '');
      nextRecord = {name: options.name, config: options.config, command, args, configFile, mode: mode ?? 'host', block, separator};
      if (table?.text !== block) changes.push({path: configFile, ...(table ? {before: table.text} : {}), after: block, table: {name: options.name, separator, fileExisted: currentConfig !== undefined}});
      if (mode === 'host' || options.dryRun && mode === undefined) {
        const skill = await readFile(path.join(options.packageRoot, 'integrations', 'codex', 'SKILL.md'), 'utf8');
        nextRecord.skill = skillFile; nextRecord.skillHash = sha(skill); nextRecord.skillText = skill;
        if (skill !== currentSkill) changes.push({path: skillFile, ...(currentSkill === undefined ? {} : {before: currentSkill}), after: skill});
      } else if (record?.skill && currentSkill !== undefined) changes.push({path: skillFile, before: currentSkill});
      report.warnings.push('Reload the Codex client after registration changes.');
    } else if (options.command === 'clean') {
      if (record) {
        if (table) changes.push({path: configFile, before: record.block, table: {name: options.name, separator: record.separator}});
        if (record.skill && currentSkill !== undefined) changes.push({path: skillFile, before: currentSkill});
        nextRecord = undefined;
      }
    } else if (record) {
      const missing = !table || record.skill && currentSkill === undefined;
      if (missing && !options.repair) {check('registration', 'fail', 'An owned registration item is missing.'); report.status = 'conflict'; return {report, exitCode: 3};}
      if (options.repair) {
        if (!table) changes.push({path: configFile, after: record.block, table: {name: options.name, separator: record.separator}});
        if (record.skill && currentSkill === undefined) {if (!record.skillText || sha(record.skillText) !== record.skillHash) throw new ProtectionConflict(); changes.push({path: skillFile, after: record.skillText});}
      }
      if (options.dryRun) check('startup', 'skipped', 'Dry run does not start registered code.');
      else {await safePath(record.config); const {diagnose} = await import('./diagnose.js'); const mode = await diagnose(record.command, record.args); if (mode !== record.mode) throw new ProtectionConflict(); check('startup', 'pass', 'Listed the actual MCP tools without a business or model call.');}
    } else {check('registration', options.command === 'doctor' ? 'fail' : 'skipped', 'No owned registration exists.'); if (options.command === 'doctor') {report.status = 'conflict'; return {report, exitCode: 3};}}
    if (nextRecord !== record) {
      if (nextRecord) Object.defineProperty(state, options.name, {value: nextRecord, enumerable: true, configurable: true, writable: true}); else delete state[options.name];
      const nextState = JSON.stringify(state, null, 2) + '\n';
      if (nextState !== stateBefore) changes.push({path: registry, ...(stateBefore === undefined ? {} : {before: stateBefore}), after: nextState});
    }
    if (options.dryRun) {report.status = 'planned'; check('write', 'skipped', 'Planned owned changes; no files were written.'); return {report, exitCode: 0};}
    if (changes.length) {
      const journal = JSON.stringify({changes} satisfies Journal);
      await atomic(journalFile, journal, undefined);
      try {
        for (const [i, change] of changes.entries()) {await apply(change); report.changed = true; await onApplied?.(i);}
        await atomic(journalFile, undefined, journal);
      } catch (error) {
        const restored = await rollback(changes);
        if (restored) {report.changed = false; await atomic(journalFile, undefined, journal);} else report.warnings.push('Rollback preserved concurrent edits; recovery remains pending.');
        throw error;
      }
    }
    check('ownership', 'pass', 'Only unchanged owned items were maintained.'); return {report, exitCode: 0};
  } catch (error) {
    report.status = error instanceof ProtectionConflict ? 'conflict' : 'failed'; check('maintenance', 'fail', error instanceof ProtectionConflict ? error.message : 'Maintenance failed; user configuration was preserved.'); return {report, exitCode: error instanceof ProtectionConflict ? 3 : 1};
  } finally {
    if (lock && held) {await unlink(path.join(lock, 'owner.json')).catch(() => {}); await rmdir(lock).catch(() => {});}
  }
}
