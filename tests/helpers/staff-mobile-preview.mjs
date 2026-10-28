// Local, synthetic preview only. This helper is not part of either application build.
import { createRequire } from 'node:module';
import { randomBytes, randomUUID } from 'node:crypto';
const keep = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'LANG', 'TZ'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
for (const key of Object.keys(process.env)) delete process.env[key];
Object.assign(process.env, keep, { NODE_ENV: 'test', CLINIC_RUNTIME_MODE: 'test', GROOMING_QA_DATABASE_PROFILE: 'staff-mobile-20261028',
  SESSION_COOKIE_SECURE: 'false', SESSION_COOKIE_NAME: 'staff_mobile_qa_session', TEMICHEVVET_LICENSE_MODE: 'compatibility', GROOMING_STAFF_PUSH_ENABLED: 'false' });
const require = createRequire(import.meta.url);
const { staffMobileFixture } = await import('./staff-mobile-fixture.mjs');
const f = await staffMobileFixture();
const { Module, ValidationPipe } = require('@nestjs/common'), { APP_GUARD, NestFactory } = require('@nestjs/core');
const load = name => require(`../../apps/api/dist/${name}.js`);
const { StaffAppController } = load('modules/staff-app/staff-app.controller');
const { StaffAppService } = load('modules/staff-app/staff-app.service');
const { AuthController } = load('modules/auth/auth.controller');
const { AuthService } = load('modules/auth/auth.service');
const { SessionAuthGuard } = load('modules/auth/session-auth.guard');
const { PermissionsGuard } = load('modules/auth/permissions.guard');
const { SESSION_COOKIE_NAME } = load('modules/auth/session-cookie');
const { PrismaService } = load('prisma/prisma.service');
const { AuditService } = load('modules/audit/audit.service');
const { GroomingCrmService } = load('modules/grooming/grooming.service');
const groomer = await f.configure(f.groomer.id, { groomingBooking: true });
const doctor = await f.configure(f.clinical.id, { clinicBooking: false });
const director = await f.actor(f.director.id);
for (const actor of [groomer, doctor, director]) await f.prisma.user.update({ where: { id: actor.userId }, data: { mustChangePassword: false } });
const options = await f.service.options(f.owner.id, f.options);
const first = options.offers[0], second = options.offers.at(-1);
for (const offer of [first, second].filter(Boolean)) await f.service.book(f.owner.id, { clientKey: randomUUID(), offerToken: offer.offerToken, notes: 'Запись с вымышленными данными для проверки мобильного интерфейса', looks: [], contactConsent: true, bookingConsent: true });
await f.appointments.createAppointment({ ownerId: f.owner.id, animalId: f.animal.id, employeeId: doctor.id, startsAt: `${f.selectedDate}T11:00:00+03:00`, comment: 'Вымышленная запись для проверки' }, doctor.id);
const colleague = await f.doctor('коллега');
await f.appointments.createAppointment({ ownerId: f.otherOwner.id, animalId: f.otherAnimal.id, employeeId: colleague.id, startsAt: `${f.selectedDate}T13:00:00+03:00`, comment: 'Вымышленный приём другого врача для проверки общего списка' }, colleague.id);
await f.prisma.employeeShift.create({ data: { employeeId: doctor.id, startsAt: new Date(`${f.selectedDate}T09:00:00+03:00`), endsAt: new Date(`${f.selectedDate}T20:00:00+03:00`) } });
await f.prisma.internalMessage.create({ data: { senderId: director.id, recipientId: doctor.id, body: 'Тестовое сообщение: расписание на день подтверждено.' } });
await f.prisma.task.create({ data: { title: 'Проверить расписание на следующий день', assigneeId: doctor.id, creatorId: director.id } });
class PreviewModule {}
Module({ controllers: [StaffAppController, AuthController], providers: [
  { provide: StaffAppService, useValue: f.mobile }, { provide: GroomingCrmService, useValue: f.service },
  { provide: AuthService, useValue: f.auth }, { provide: PrismaService, useValue: f.prisma }, { provide: AuditService, useValue: f.audit },
  { provide: APP_GUARD, useClass: SessionAuthGuard }, { provide: APP_GUARD, useClass: PermissionsGuard },
] })(PreviewModule);
const app = await NestFactory.create(PreviewModule, { logger: false });
app.setGlobalPrefix('api');
app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
app.use(async (request, response, next) => {
  const path = new URL(request.url, 'http://127.0.0.1').pathname;
  const role = path.replace('/api/__qa/session/', '');
  if (!path.startsWith('/api/__qa/session/')) return next();
  if (!['groomer', 'doctor', 'doctor-booking', 'director'].includes(role)) return response.sendStatus(404);
  const employee = role === 'groomer' ? groomer : role === 'director' ? director : doctor;
  if (role === 'doctor' || role === 'doctor-booking') await f.configure(doctor.id, { clinicBooking: role === 'doctor-booking' });
  const token = randomBytes(32).toString('base64url');
  await f.prisma.session.create({ data: { id: f.auth.hashSessionToken(token), userId: employee.userId, accessType: 'LOCAL', expiresAt: new Date(Date.now() + 86400000) } });
  response.cookie(SESSION_COOKIE_NAME, token, { httpOnly: true, sameSite: 'strict', secure: false, path: '/' });
  response.redirect(303, `/staff/calendar?date=${f.selectedDate}`);
});
await app.listen(4252, '127.0.0.1');
console.log(JSON.stringify({ syntheticPreviewReady: true, apiPort: 4252, selectedDate: f.selectedDate, roles: ['groomer', 'doctor', 'doctor-booking', 'director'], externalDelivery: false }));
let closing = false;
async function close() { if (closing) return; closing = true; await app.close(); await f.close(); process.exit(0); }
process.on('SIGINT', close); process.on('SIGTERM', close);
process.stdin.on('data', value => { if (value.toString().trim() === 'stop') void close(); });
