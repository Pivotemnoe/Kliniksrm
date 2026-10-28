const fs = require('node:fs'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const req = createRequire('/app/apps/api/package.json');
const { PrismaClient } = req('@prisma/client');
const db = new PrismaClient();
(async () => {
  const m = JSON.parse(fs.readFileSync(process.argv[2] || '/tmp/staff-native-release.json', 'utf8'));
  const rows = await db.$queryRawUnsafe('SELECT migration_name,checksum,finished_at,rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name');
  for (const old of m.previousMigrations) {
    const current = rows.find(row => row.migration_name === old.migration_name && row.checksum === old.checksum && row.finished_at && !row.rolled_back_at);
    assert.ok(current, 'Previous applied migration differs');
  }
  assert.ok(rows.every(row => row.finished_at || row.rolled_back_at), 'Unfinished migration');
  const added = rows.filter(row => !m.previousMigrations.some(old => old.migration_name === row.migration_name));
  assert.equal(added.length, 1, 'Only the reviewed migration may be added');
  assert.equal(added[0].migration_name, m.migration); assert.equal(added[0].checksum, m.migrationSha256);
  const column = await db.$queryRawUnsafe(`SELECT is_nullable,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='InternalMessage' AND column_name='clientKey'`);
  assert.equal(column[0]?.is_nullable, 'YES'); assert.equal(column[0]?.data_type, 'text');
  for (const model of ['staffClinicChannel', 'staffClinicChatMembership', 'staffClinicChatMessage', 'staffNativePushDevice', 'staffNativePushEvent', 'staffNativePushDelivery']) await db[model].count();
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync('/app/prisma/schema.prisma')).digest('hex'), m.schemaSha256);
  console.log(JSON.stringify({ migrationApplied: true, previousLedgerPreserved: true, staffSchemaReady: true, appliedMigrations: rows.filter(row => row.finished_at && !row.rolled_back_at).length }));
})().catch(() => { console.error('Staff migration/schema qualification failed'); process.exitCode = 1; }).finally(() => db.$disconnect());
