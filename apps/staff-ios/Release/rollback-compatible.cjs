const { createRequire } = require('node:module');
const req = createRequire('/app/apps/api/package.json');
const { PrismaClient } = req('@prisma/client');
const db = new PrismaClient();
const url = new URL(process.env.DATABASE_URL);
if (url.hostname !== '127.0.0.1' || url.pathname !== '/restore_test' || url.username !== 'restore_test') throw Error('Isolated restored database required');
(async () => {
  await db.user.findFirst({ include: { employee: { include: { roles: { include: { role: true } }, permissionOverrides: { include: { permission: true } } } } } });
  await db.internalMessage.findFirst({ include: { sender: true, recipient: true } });
  await db.appointment.findFirst(); await db.groomingReservation.findFirst({ include: { rule: true } });
  require('/app/apps/api/dist/modules/auth/auth.controller.js');
  require('/app/apps/api/dist/modules/grooming/grooming.service.js');
  console.log(JSON.stringify({ oldRuntimeReadsMigratedDatabase: true, additiveStaffSchemaRetained: true, businessDataRestored: false }));
})().catch(() => { console.error('Previous API compatibility qualification failed'); process.exitCode = 1; }).finally(() => db.$disconnect());
