import { spawnSync } from 'node:child_process';
import { mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
const commit = '365ef4914b72d487be1e689360bad66f64d08c9a';
const source = '/Users/konstantin/.codex/worktrees/pet-hotel-production-20261020/CRM';
const destination = new URL('../ServerAdapter/grooming-duration/', import.meta.url);
const paths = ['apps/api/src/modules/grooming/grooming.service.ts', 'apps/api/src/modules/grooming/grooming.controller.ts', 'apps/api/src/modules/grooming/grooming.dto.ts', 'apps/api/src/modules/grooming/grooming-staff-notifications.service.ts', 'docs/grooming-calendar-acceptance-20261028.md'];
const files = [];
let conflicts = false;
for (const path of paths) {
  const result = spawnSync('git', ['-C', source, 'show', commit + ':' + path], { maxBuffer: 2 * 1024 * 1024 });
  if (result.status !== 0) throw new Error('Cannot read verified grooming source: ' + path);
  const target = new URL(path, destination); await mkdir(new URL('.', target), { recursive: true }); await writeFile(target, result.stdout);
  const entry = { path, sha256: createHash('sha256').update(result.stdout).digest('hex') };
  if (path.startsWith('apps/api/')) {
    const temporary = await mkdtemp(tmpdir() + '/staff-ios-groom-merge-');
    try {
      for (const [name, revision] of [['pwa', '813d2ab5a0f5f792d562d3369c51a602b2471e1b'], ['base', 'c43e0e8c8dd46de80a4616072b1a8f9d2826d1c1'], ['grooming', commit]]) {
        const read = spawnSync('git', ['-C', source, 'show', revision + ':' + path]);
        if (read.status !== 0) throw new Error('Cannot read merge source');
        await writeFile(temporary + '/' + name, read.stdout);
      }
      const merge = spawnSync('git', ['merge-file', '--diff3', '-p', temporary + '/pwa', temporary + '/base', temporary + '/grooming'], { maxBuffer: 2 * 1024 * 1024 });
      if (merge.status === null || merge.status >= 128 || !merge.stdout.length) throw new Error('Three-way source merge failed: ' + merge.stderr.toString());
      const output = new URL('merged/' + path, destination); await mkdir(new URL('.', output), { recursive: true }); await writeFile(output, merge.stdout);
      entry.mergedSha256 = createHash('sha256').update(merge.stdout).digest('hex');
      if (merge.status > 0) { conflicts = true; console.error('Resolve candidate merge: ' + path); }
    } finally { await rm(temporary, { recursive: true, force: true }); }
  }
  files.push(entry);
}
await writeFile(new URL('manifest.json', destination), JSON.stringify({ commit, source, capturedAt: new Date().toISOString(), schemaAddition: 'GroomingServiceRule.followShiftWorkplace Boolean @default(false)', files }, null, 2));
console.log(JSON.stringify({ groomingDurationSnapshot: true, commit, files: files.length }));
if (conflicts) process.exitCode = 1;
