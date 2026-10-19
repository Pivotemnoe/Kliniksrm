import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { qaDir, packet, qaProject, root } from './config.mjs';

const mode = process.argv[2] || 'Inspect';
assert.ok(['Inspect', 'Apply', 'Rollback'].includes(mode));
const backupFolder = process.argv[3] || 'backup';
assert.match(backupFolder, /^backup(?:-[a-z0-9]+)?$/);
const result = spawnSync('docker', ['run', '--rm', '--platform', 'linux/amd64', '--network', qaProject,
  '--label', `io.temichevvet.release-qa=${qaProject}`, '--mount', 'type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock',
  '--mount', `type=bind,source=${resolve(root, 'scripts/redesign-release')},target=/scripts,readonly`,
  '--mount', `type=bind,source=${qaDir},target=/qa`, '--mount', `type=bind,source=${packet},target=/packet,readonly`,
  'crm-redesign-qa-tools:20261019', 'pwsh', '-NoLogo', '-NoProfile', '-File', '/scripts/qa-web-operation.ps1', '-Mode', mode,
  '-BackupFolder', backupFolder, ...(process.argv.includes('--fail-release-check') ? ['-FailReleaseCheck'] : [])], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
await writeFile(resolve(qaDir, `${mode.toLowerCase()}-${backupFolder}-operation.log`), result.stdout + result.stderr);
console.log(result.stdout); if (result.stderr) console.error(result.stderr);
if (result.status !== 0) process.exit(result.status || 1);
