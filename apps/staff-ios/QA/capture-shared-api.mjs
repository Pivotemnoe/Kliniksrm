// Capture the API owned by the Android chat. Never edits that checkout or the CRM source tree.
import { readFile, writeFile, mkdir, readdir, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const sourceRoot = '/Users/konstantin/.codex/worktrees/staff-android-native/CRM';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const destination = new URL('../ServerAdapter/shared-chat/', import.meta.url);
const base = '813d2ab5a0f5f792d562d3369c51a602b2471e1b';
if (spawnSync('git', ['-C', sourceRoot, 'merge-base', '--is-ancestor', base, 'HEAD']).status !== 0) throw new Error('Shared API checkout does not descend from the reviewed staff base');
const files = ['apps/api/src/app.module.ts', 'apps/api/src/modules/auth/session-auth.guard.ts', 'apps/api/src/modules/auth/decorators/passive-session-activity.decorator.ts', 'prisma/schema.prisma', 'docs/mobile/STAFF_CHAT_API.md'];
for (const folder of ['apps/api/src/modules/internal-messages', 'apps/api/src/modules/staff-native-push']) {
  async function visit(path) { for (const entry of await readdir(sourceRoot + '/' + path, { withFileTypes: true })) { const p = path + '/' + entry.name; if (entry.isDirectory()) await visit(p); else if (p.endsWith('.ts')) files.push(p); } }
  await visit(folder);
}
const manifest = { source: sourceRoot, baseCommit: base, capturedAt: new Date().toISOString(), files: [] };
for (const path of files.sort()) {
  const data = await readFile(sourceRoot + '/' + path);
  const target = new URL(path, destination); await mkdir(new URL('.', target), { recursive: true }); await writeFile(target, data);
  manifest.files.push({ path, sha256: createHash('sha256').update(data).digest('hex') });
}
await writeFile(new URL('manifest.json', destination), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ sharedAPISnapshot: true, files: manifest.files.length, sourceBase: base }));
