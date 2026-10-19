'use strict';
// Run inside the released API. It does not create clients, prices or shifts.
const { PrismaClient } = require('/app/node_modules/@prisma/client');
const { AuditService } = require('/app/apps/api/dist/modules/audit/audit.service.js');
const { SupportService } = require('/app/apps/api/dist/modules/support/support.service.js');
const { ClinicModulesService } = require('/app/apps/api/dist/modules/clinic-modules/clinic-modules.service.js');
const prisma = new PrismaClient();
(async () => {
  try {
    const actorId = process.env.GROOMING_MODULE_ACTOR_ID;
    const actor = actorId && await prisma.employee.findFirst({
      where: { id: actorId, status: 'ACTIVE', roles: { some: { role: { code: 'director' } } } },
      select: { id: true },
    });
    if (!actor) throw new Error('An explicitly selected active director is required');
    const audit = new AuditService(prisma);
    const modules = new ClinicModulesService(prisma, audit, new SupportService(prisma, audit, undefined));
    let installation = await modules.installation('GROOMING');
    if (!installation.enabled) installation = await modules.setEnabled('GROOMING', true, installation.version, actor.id);
    const settings = await prisma.groomingSettings.upsert({
      where: { installationId: installation.id },
      create: { installationId: installation.id, selfBookingEnabled: false, reminderHours: [24, 2] },
      update: {},
    });
    console.log(JSON.stringify({ enabled: installation.enabled, selfBookingEnabled: settings.selfBookingEnabled, clinicalRecordsCreated: false }));
    await prisma.$disconnect(); process.exit(0);
  } catch (error) { console.error(error.message); await prisma.$disconnect(); process.exit(1); }
})();
