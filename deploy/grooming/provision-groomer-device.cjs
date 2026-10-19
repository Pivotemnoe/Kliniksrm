'use strict';
// Run explicitly inside the clinic API with /provision bound to the protected
// installation/private directory. Never print the credential or invitation.
const fs = require('node:fs');
const { randomBytes } = require('node:crypto');
const { PrismaClient } = require('/app/node_modules/@prisma/client');
const { PasswordService } = require('/app/apps/api/dist/modules/auth/password.service.js');
const { AuditService } = require('/app/apps/api/dist/modules/audit/audit.service.js');
const { SupportService } = require('/app/apps/api/dist/modules/support/support.service.js');
const { ClinicModulesService } = require('/app/apps/api/dist/modules/clinic-modules/clinic-modules.service.js');
const { RemoteAccessService } = require('/app/apps/api/dist/modules/remote-access/remote-access.service.js');
const prisma = new PrismaClient();
const email = 'groomer-device-test-20261019@example.invalid';
const receiptPath = '/provision/groomer-device-test-20261019.json';
function save(receipt) {
  const temporary = receiptPath + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(receipt, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, receiptPath);
}
(async () => {
  try {
    const actorId = process.env.GROOMING_MODULE_ACTOR_ID;
    const maxUserId = process.env.GROOMING_TEST_MAX_USER_ID;
    if (!maxUserId || !/^\d{1,20}$/.test(maxUserId)) throw new Error('An explicitly verified MAX recipient is required');
    if (!fs.statSync('/provision').isDirectory()) throw new Error('Protected provision directory is required');
    const actor = actorId && await prisma.employee.findFirst({ where: { id: actorId, status: 'ACTIVE', roles: { some: { role: { code: 'director' } } } }, select: { id: true } });
    if (!actor) throw new Error('An explicitly selected active director is required');
    const audit = new AuditService(prisma);
    const modules = new ClinicModulesService(prisma, audit, new SupportService(prisma, audit, undefined));
    const installation = await modules.assertEnabled('GROOMING');
    const role = await prisma.role.findUniqueOrThrow({ where: { code: 'groomer' }, include: { permissions: { include: { permission: true } } } });
    const permissions = role.permissions.map(p => p.permission.code).sort();
    if (JSON.stringify(permissions) !== JSON.stringify(['grooming.operate', 'grooming.read'])) throw new Error('Groomer role has unexpected permissions');
    let receipt = fs.existsSync(receiptPath) ? JSON.parse(fs.readFileSync(receiptPath, 'utf8')) : null;
    if (!receipt) {
      if (await prisma.user.findUnique({ where: { email } })) throw new Error('Test identity already exists without its private receipt; refusing a password reset');
      const temporaryPassword = 'Groom9-' + randomBytes(24).toString('base64url');
      const passwordHash = await new PasswordService().hashPassword(temporaryPassword);
      const employee = await prisma.$transaction(async tx => {
        const user = await tx.user.create({ data: { email, passwordHash, mustChangePassword: true } });
        const employee = await tx.employee.create({ data: { userId: user.id, fullName: 'Проверка груминга · Константин', position: 'Тестовый грумер', defaultRoute: '/grooming/calendar', restrictLoginToShifts: false, roles: { create: { roleId: role.id } }, groomingProfile: { create: { installationId: installation.id, displayName: 'Тестовый грумер', species: ['DOG', 'CAT'], maxUserId } } } });
        await audit.log({ actorId, action: 'grooming.test_groomer_provision', entityType: 'Employee', entityId: employee.id, metadata: { testAccount: true, permissions, publicSlotsCreated: false } }, tx);
        return employee;
      });
      receipt = { createdAt: new Date().toISOString(), email, temporaryPassword, employeeId: employee.id };
      save(receipt);
    }
    const employee = await prisma.employee.findUniqueOrThrow({ where: { id: receipt.employeeId }, include: { user: true, groomingProfile: true, permissionOverrides: true, roles: { include: { role: true } } } });
    if (employee.user?.email !== email || employee.status !== 'ACTIVE' || employee.roles.length !== 1 || employee.roles[0].role.code !== 'groomer' || employee.permissionOverrides.length || employee.groomingProfile?.installationId !== installation.id || employee.groomingProfile?.maxUserId !== maxUserId) throw new Error('Existing test identity differs; refusing to change its access');
    if (!employee.user.mustChangePassword) {
      delete receipt.temporaryPassword;
      save(receipt);
      console.log(JSON.stringify({ employeeId: employee.id, role: 'groomer', passwordAlreadyChanged: true, credentialsPrinted: false }));
    } else {
      const invitation = await new RemoteAccessService(prisma, audit).createInvitation({ employeeId: employee.id, deviceName: 'Android · тестовый грумер' }, actorId);
      const url = new URL(invitation.enrollmentUrl);
      url.pathname = '/grooming/remote/enroll';
      receipt.invitation = { id: invitation.id, enrollmentUrl: url.href, expiresAt: invitation.expiresAt };
      save(receipt);
      console.log(JSON.stringify({ employeeId: employee.id, role: 'groomer', invitationExpiresAt: invitation.expiresAt, credentialsPrinted: false, publicSlotsCreated: false }));
    }
    await prisma.$disconnect(); process.exit(0);
  } catch (error) { console.error(error.message); await prisma.$disconnect(); process.exit(1); }
})();
