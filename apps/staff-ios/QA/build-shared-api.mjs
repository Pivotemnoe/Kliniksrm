import { readFile, writeFile, mkdir, cp, symlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const snapshot = new URL('../ServerAdapter/shared-chat/', import.meta.url);
const backend = new URL('./.generated/backend/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', snapshot)));
if (manifest.baseCommit !== '813d2ab5a0f5f792d562d3369c51a602b2471e1b') throw new Error('Unreviewed shared API base');
await mkdir(new URL('apps/api/', backend), { recursive: true });
await cp(root + '/apps/api/src', fileURLToPath(new URL('apps/api/src', backend)), { recursive: true });
await cp(root + '/apps/api/package.json', fileURLToPath(new URL('apps/api/package.json', backend)));
for (const file of manifest.files) {
  const data = await readFile(new URL(file.path, snapshot));
  if (createHash('sha256').update(data).digest('hex') !== file.sha256) throw new Error('Shared snapshot hash mismatch: ' + file.path);
  const target = new URL(file.path, backend); await mkdir(new URL('.', target), { recursive: true }); await writeFile(target, data);
}
const grooming = new URL('../ServerAdapter/grooming-duration/', import.meta.url);
const groomingManifest = JSON.parse(await readFile(new URL('manifest.json', grooming)));
if (groomingManifest.commit !== '365ef4914b72d487be1e689360bad66f64d08c9a') throw new Error('Unreviewed grooming adapter');
for (const file of groomingManifest.files) {
  const data = await readFile(new URL((file.mergedSha256 ? 'merged/' : '') + file.path, grooming));
  if (createHash('sha256').update(data).digest('hex') !== (file.mergedSha256 ?? file.sha256)) throw new Error('Grooming adapter hash mismatch');
  if (data.includes(Buffer.from('<<<<<<<'))) throw new Error('Unresolved grooming integration conflict');
  const target = new URL(file.path, backend); await mkdir(new URL('.', target), { recursive: true }); await writeFile(target, data);
}
const schemaURL = new URL('prisma/schema.prisma', backend);
let schema = await readFile(schemaURL, 'utf8');
const rule = schema.match(/model GroomingServiceRule \{[\s\S]*?\n\}/)?.[0];
if (!rule) throw new Error('GroomingServiceRule model missing');
if (!rule.includes('followShiftWorkplace')) schema = schema.replace(rule, rule.replace(/(  coat String @default\("ANY"\)\n)/, '$1  followShiftWorkplace Boolean @default(false)\n'));
if (!/followShiftWorkplace\s+Boolean\s+@default\(false\)/.test(schema)) throw new Error('Cannot isolate grooming schema addition');
await writeFile(schemaURL, schema);
for (const [target, source] of [['node_modules', root + '/node_modules'], ['apps/api/node_modules', root + '/apps/api/node_modules']]) {
  try { await symlink(source, fileURLToPath(new URL(target, backend)), 'dir'); } catch (e) { if (e.code !== 'EEXIST') throw e; }
}
const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'LANG', 'TZ'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
env.DATABASE_URL = 'postgresql://unused:unused@127.0.0.1:1/unused'; // generate only, no database connection
let result = spawnSync(process.execPath, [root + '/node_modules/prisma/build/index.js', 'generate', '--schema', fileURLToPath(new URL('prisma/schema.prisma', backend))], { env, stdio: 'inherit', cwd: root });
if (result.status !== 0) process.exit(result.status || 1);
const config = JSON.parse(await readFile(root + '/apps/api/tsconfig.json', 'utf8'));
config.compilerOptions.incremental = false;
await writeFile(new URL('apps/api/tsconfig.json', backend), JSON.stringify(config, null, 2));
result = spawnSync(process.execPath, [root + '/node_modules/typescript/bin/tsc', '-p', fileURLToPath(new URL('apps/api/tsconfig.json', backend))], { env, stdio: 'inherit', cwd: root });
if (result.status !== 0) process.exit(result.status || 1);
console.log(JSON.stringify({ isolatedSharedAPICompiled: true, sourceFiles: manifest.files.length }));
