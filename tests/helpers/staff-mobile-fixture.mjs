import 'reflect-metadata';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { groomingFixture, qaSecret, qaPassword } from './grooming-crm-fixture.mjs';
const require = createRequire(import.meta.url);
const load = name => require(`../../apps/api/dist/modules/${name}.js`);
const { AuthService } = load('auth/auth.service'), { PasswordService } = load('auth/password.service');
const { SchedulingService } = load('scheduling/scheduling.service'), { AppointmentsService } = load('appointments/appointments.service');
const { OwnersService } = load('owners/owners.service'), { AnimalCatalogService } = load('animals/animal-catalog.service');
const { GroomingStaffNotificationsService } = load('grooming/grooming-staff-notifications.service');
const { StaffAppService } = load('staff-app/staff-app.service');
export { qaPassword };
export async function staffMobileFixture() {
  process.env.GROOMING_BOOKING_SIGNING_SECRET = qaSecret;
  const f = await groomingFixture();
  const auth = new AuthService(f.prisma, new PasswordService(), f.audit);
  const scheduling = new SchedulingService(f.prisma, f.audit);
  const appointments = new AppointmentsService(f.prisma, f.audit, scheduling);
  const owners = new OwnersService(f.prisma, f.audit, new AnimalCatalogService(f.prisma));
  const notices = new GroomingStaffNotificationsService(f.prisma, f.modules);
  // No live delivery is possible from this fixture.
  notices.send = async () => { throw new Error('External push transport is forbidden in staff-mobile QA'); };
  const mobile = new StaffAppService(f.prisma, f.audit, auth, appointments, f.service, notices, owners);
  const include = { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } }, permissionOverrides: { include: { permission: true } } };
  const actor = async id => auth.serializeEmployee(await f.prisma.employee.findUniqueOrThrow({ where: { id }, include }));
  async function grant(id, code, effect = 'GRANT') {
    const permission = await f.prisma.permission.upsert({ where: { code }, create: { code, title: `Проверка: ${code}` }, update: {} });
    await f.prisma.employeePermissionOverride.upsert({ where: { employeeId_permissionId: { employeeId: id, permissionId: permission.id } }, create: { employeeId: id, permissionId: permission.id, effect }, update: { effect } });
  }
  await grant(f.director.id, 'employees.manage');
  await grant(f.administrator.id, 'grooming.manage');
  for (const employee of [f.groomer, f.otherGroomer]) await f.prisma.employee.update({ where: { id: employee.id }, data: { accountScope: 'GROOMING' } });
  async function doctor(suffix = 'doctor') {
    const role = await f.prisma.role.upsert({ where: { code: 'doctor' }, create: { code: 'doctor', title: 'Врач' }, update: {} });
    const cashier = await f.prisma.role.upsert({ where: { code: 'cashier' }, create: { code: 'cashier', title: 'Кассир' }, update: {} });
    const stock = await f.prisma.role.upsert({ where: { code: 'stock' }, create: { code: 'stock', title: 'Склад' }, update: {} });
    const passwordHash = await new PasswordService().hashPassword(qaPassword);
    const employee = await f.prisma.employee.create({ data: { fullName: `Врач · ${suffix} · тест`, accountScope: 'CLINIC', position: 'Врач',
      user: { create: { email: `${f.prefix}-${suffix}-${randomUUID()}@example.local`, passwordHash, mustChangePassword: false } }, roles: { create: [role, cashier, stock].map(item => ({ roleId: item.id })) } } });
    for (const code of ['appointments.read', 'appointments.manage', 'owners.read', 'animals.read', 'visits.read', 'tasks.read', 'notifications.read', 'payments.manage', 'stock.read']) await grant(employee.id, code);
    for (const code of ['business.read', 'business.manage', 'payroll.read', 'payroll.manage', 'daily_finance.read', 'daily_finance.manage']) await grant(employee.id, code, 'DENY');
    return actor(employee.id);
  }
  const clinical = await doctor();
  if (!await f.prisma.clinicOffice.findFirst()) await f.prisma.clinicOffice.create({ data: { organizationId: 'grooming-qa-organization', name: 'Клиника · синтетическая проверка PWA', address: 'Вымышленный адрес' } });
  async function configure(id, flags) {
    const current = await f.prisma.employee.findUniqueOrThrow({ where: { id } });
    const previous = (await actor(id)).staffApp;
    await mobile.saveSettings(id, { ...previous, ...flags, updatedAt: current.updatedAt.toISOString() }, await actor(f.director.id));
    return actor(id);
  }
  // A unique synthetic phone avoids ambiguous old fixtures in the shared QA database.
  const phone = `7999${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
  await f.prisma.owner.update({ where: { id: f.owner.id }, data: { phone: `+${phone}`, phoneNormalized: phone } });
  return { ...f, auth, scheduling, appointments, owners, notices, mobile, actor, grant, doctor, clinical, configure, phone };
}
