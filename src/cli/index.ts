#!/usr/bin/env node
import {fileURLToPath} from 'node:url';
import {PACKAGE_VERSION} from '../internal/version.js';

const args = process.argv.slice(2), version = PACKAGE_VERSION;
const usage = 'intent-runtime setup --host codex --config <trusted-absolute-path.js|.mjs> [--name <name>] [--dry-run] [--json]\nintent-runtime doctor --host codex [--name <name>] [--repair] [--dry-run] [--json]\nintent-runtime clean --host codex [--name <name>] [--dry-run] [--json]\n';
if (args.length === 1 && args[0] === '--help') process.stdout.write(usage);
else if (args.length === 1 && args[0] === '--version') process.stdout.write(version + '\n');
else {
  const command = args[0]; const values = new Map<string, string | boolean>(); let invalid = !['setup', 'doctor', 'clean'].includes(command ?? '');
  for (let i = 1; i < args.length; i++) {
    const key = args[i]!;
    if (values.has(key)) {invalid = true; break;}
    if (['--json', '--dry-run', '--repair'].includes(key)) values.set(key, true);
    else if (['--host', '--config', '--name'].includes(key) && args[i + 1] && !args[i + 1]!.startsWith('--')) values.set(key, args[++i]!);
    else {invalid = true; break;}
  }
  if (values.get('--host') !== 'codex' || command === 'setup' && !values.has('--config') || command !== 'setup' && values.has('--config') || values.has('--repair') && command !== 'doctor' || command === 'doctor' && values.has('--dry-run') && !values.has('--repair')) invalid = true;
  if (invalid) {
    if (args.includes('--json') && ['setup', 'doctor', 'clean'].includes(command ?? '')) process.stdout.write(JSON.stringify({command, status: 'failed', changed: false, checks: [{name: 'arguments', status: 'fail', message: 'Invalid maintenance arguments.'}], paths: [], warnings: []}) + '\n');
    else process.stderr.write(usage);
    process.exitCode = 2;
  }
  else {
    try {
      const {maintain} = await import('./maintenance.js');
      const {report, exitCode} = await maintain({command: command as 'setup' | 'doctor' | 'clean', host: 'codex', name: values.get('--name') as string ?? 'intent-runtime', ...(values.has('--config') ? {config: values.get('--config') as string} : {}), repair: values.has('--repair'), dryRun: values.has('--dry-run'), packageRoot: fileURLToPath(new URL('../../', import.meta.url))});
      process.stdout.write(values.has('--json') ? JSON.stringify(report) + '\n' : `${report.command}: ${report.status}; changed=${report.changed}\n` + report.checks.map(c => `${c.name}: ${c.message}\n`).join(''));
      process.exitCode = exitCode;
    } catch {process.stderr.write('Maintenance startup failed; check installed dependencies.\n'); process.exitCode = 1;}
  }
}
