import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { qaDir, qaProject, root } from './config.mjs';
const backupFolder=process.argv[2]||'backup-final';
if(!/^backup(?:-[a-z0-9]+)?$/.test(backupFolder))throw new Error('Invalid QA backup folder');
const result=spawnSync('docker',['run','--rm','--platform','linux/amd64','--network',qaProject,
  '--label',`io.temichevvet.release-qa=${qaProject}`,'--mount','type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock',
  '--mount',`type=bind,source=${resolve(root,'scripts/redesign-release')},target=/scripts,readonly`,
  '--mount',`type=bind,source=${qaDir},target=/qa`,
  'crm-redesign-qa-tools:20261019','pwsh','-NoLogo','-NoProfile','-File','/scripts/qa-backup-operation.ps1','-BackupFolder',backupFolder],{encoding:'utf8',maxBuffer:1024*1024});
await writeFile(resolve(qaDir,`prepare-${backupFolder}-operation.log`),result.stdout+result.stderr);
console.log(result.stdout); if(result.stderr)console.error(result.stderr);
if(result.status!==0)process.exit(result.status||1);
