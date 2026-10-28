const { createRequire } = require('node:module');
const req = createRequire('/app/apps/api/package.json');
const { PrismaClient } = req('@prisma/client');
const db = new PrismaClient();
const url = new URL(process.env.DATABASE_URL);
if (url.hostname !== '127.0.0.1' || url.pathname !== '/restore_test' || url.username !== 'restore_test') throw Error('Isolated restored database required');
(async () => {
  const tables = await db.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`);
  const out = {};
  for (const { tablename: name } of tables) {
    if (name === '_prisma_migrations' || /^Staff(?:Clinic|Native)/.test(name)) continue;
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) throw Error('Unexpected table identifier');
    const row = name === 'InternalMessage' ? "(to_jsonb(t)-'clientKey')" : 'to_jsonb(t)';
    out[name] = (await db.$queryRawUnsafe(`SELECT count(*)::int AS n, md5(coalesce(string_agg(md5(${row}::text),'' ORDER BY ${row}::text),'')) AS h FROM "${name}" t`))[0];
  }
  console.log(JSON.stringify(out));
})().catch(() => { console.error('Protected restored-data snapshot failed'); process.exitCode = 1; }).finally(() => db.$disconnect());
