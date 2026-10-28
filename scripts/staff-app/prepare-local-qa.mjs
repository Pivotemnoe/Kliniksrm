import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { crmUrl, portalUrl } from '../../tests/helpers/grooming-crm-fixture.mjs';
const require = createRequire(import.meta.url), { PrismaClient } = require('@prisma/client');
if (process.env.STAFF_APP_QA_CONFIRM !== 'isolated-synthetic') throw new Error('Explicit isolated QA confirmation is required');
const schemaName = 'staff_mobile_qa_20261028';
const marker = 'Codex staff-mobile isolated synthetic QA 20261028';
for (const value of [crmUrl, portalUrl]) {
  const url = new URL(value);
  if (url.hostname !== '127.0.0.1' || url.port !== '55440' || url.username !== 'grooming_module_qa') throw new Error('Not the synthetic local QA service');
}
try {
  for (const url of [crmUrl, portalUrl]) {
    const admin = new PrismaClient({ datasources: { db: { url } } });
    try {
      const found = await admin.$queryRaw`SELECT obj_description(oid, 'pg_namespace') AS marker FROM pg_namespace WHERE nspname = ${schemaName}`;
      if (found.length && found[0].marker !== marker) throw new Error('Existing schema is not owned by this QA task');
      const reset = process.env.STAFF_APP_QA_RESET === 'synthetic-schema-only';
      if (found.length && reset) await admin.$executeRawUnsafe(`DROP SCHEMA "${schemaName}" CASCADE`);
      if (!found.length || reset) {
        // Identifiers are fixed constants above, never user input.
        await admin.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
        await admin.$executeRawUnsafe(`COMMENT ON SCHEMA "${schemaName}" IS '${marker}'`);
      }
    } finally { await admin.$disconnect(); }
    const scoped = new PrismaClient({ datasources: { db: { url: url + '?schema=' + schemaName } } });
    try {
      const current = await scoped.$queryRaw`SELECT current_schema() AS name`;
      if (current[0].name !== schemaName) throw new Error('QA search path is not isolated');
    } finally { await scoped.$disconnect(); }
  }
  const env = Object.fromEntries(['PATH', 'HOME', 'LANG', 'TZ', 'TMPDIR'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  env.DATABASE_URL = crmUrl + '?schema=' + schemaName;
  env.OWNER_GATEWAY_DATABASE_URL = portalUrl + '?schema=' + schemaName;
  for (const schema of ['prisma/schema.prisma', 'apps/owner-gateway/prisma/schema.prisma']) {
    const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate', '--schema', schema], { env, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`Isolated schema setup failed (${schema}): ${result.stderr.slice(-1000)}`);
  }
  const crm = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  try {
    for (const code of ['grooming.read', 'grooming.operate', 'grooming.manage', 'grooming.schedule', 'modules.manage', 'remote_access.read', 'remote_access.manage']) {
      await crm.permission.upsert({ where: { code }, create: { code, title: `Синтетическая проверка: ${code}` }, update: {} });
    }
    await crm.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public');
    // Prisma schema cannot express exclusion constraints; take the real statements from reviewed migrations.
    for (const name of (await readdir('prisma/migrations')).sort()) {
      if (!name.includes('grooming')) continue;
      const sql = await readFile(`prisma/migrations/${name}/migration.sql`, 'utf8');
      for (const match of sql.matchAll(/ALTER TABLE "(GroomingReservation|GroomingWorkPeriod)"\s+ADD CONSTRAINT "([^"]+)"\s+EXCLUDE[^;]+;/g)) {
        const found = await crm.$queryRaw`SELECT 1 FROM pg_constraint WHERE conname = ${match[2]} AND connamespace = (SELECT oid FROM pg_namespace WHERE nspname = ${schemaName})`;
        if (!found.length) await crm.$executeRawUnsafe(match[0]);
      }
    }
  } finally { await crm.$disconnect(); }
  console.log(JSON.stringify({ isolatedSchemasReady: 2, profile: 'staff-mobile-20261028' }));
} catch (error) {
  console.error(JSON.stringify({ isolatedSchemasReady: false, code: error.meta?.code || error.code || 'setup_error', message: error.message.split('\n').at(-1).slice(0, 200) }));
  process.exitCode = 1;
}
