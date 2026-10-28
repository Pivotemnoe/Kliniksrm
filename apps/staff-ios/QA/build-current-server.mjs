import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const backend = fileURLToPath(new URL('./.generated/backend/', import.meta.url));
function run(command, args, env) {
  const r = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
}
run(process.execPath, [fileURLToPath(new URL('./build-shared-api.mjs', import.meta.url))], { ...process.env, STAFF_IOS_COMPOSE_ONLY: '1' });
run('python3', [fileURLToPath(new URL('./integrate-current-server.py', import.meta.url))], process.env);
const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'LANG', 'TZ'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
env.DATABASE_URL = 'postgresql://unused:unused@127.0.0.1:1/unused';
run(process.execPath, [root + '/node_modules/prisma/build/index.js', 'generate', '--schema', backend + '/prisma/schema.prisma'], env);
const config = JSON.parse(await readFile(root + '/apps/api/tsconfig.json', 'utf8'));
config.compilerOptions.incremental = false;
await writeFile(backend + '/apps/api/tsconfig.json', JSON.stringify(config, null, 2));
run(process.execPath, [root + '/node_modules/typescript/bin/tsc', '-p', backend + '/apps/api/tsconfig.json'], env);
const migration = spawnSync(process.execPath, [root + '/node_modules/prisma/build/index.js', 'migrate', 'diff',
  '--from-schema-datamodel', root + '/apps/staff-ios/build/ServerCandidate/current-schema.prisma',
  '--to-schema-datamodel', backend + '/prisma/schema.prisma', '--script'], { env, cwd: root, encoding: 'utf8' });
if (migration.status !== 0) throw new Error('Cannot derive additive staff schema: ' + migration.stderr);
const statements = migration.stdout.replace(/--[^\n]*/g, '').split(';').map(s => s.trim()).filter(Boolean);
if (statements.some(sql => !/^(?:CREATE (?:TABLE|(?:UNIQUE )?INDEX) |ALTER TABLE "[A-Za-z0-9_]+" ADD (?:COLUMN|CONSTRAINT)\b)/.test(sql))) {
  throw new Error('Only additive table/column/index/foreign-key statements are allowed');
}
await writeFile(new URL('../ServerAdapter/password-login/staff-integration.sql', import.meta.url), migration.stdout);
console.log(JSON.stringify({ currentServerAPICompiled: true, destructiveSchemaStatements: false, productionChanged: false }));
