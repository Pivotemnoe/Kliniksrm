// Loopback-only Nest/Prisma acceptance API. No production configuration, no fake login.
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { createServer, request as proxyRequest } from 'node:http';
import { writeFile } from 'node:fs/promises';
const keep = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'LANG', 'TZ'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
for (const key of Object.keys(process.env)) delete process.env[key];
Object.assign(process.env, keep, { NODE_ENV: 'test', CLINIC_RUNTIME_MODE: 'test', GROOMING_QA_DATABASE_PROFILE: 'staff-ios-20261028', SESSION_COOKIE_SECURE: 'false', SESSION_COOKIE_NAME: 'staff_ios_qa_session', TEMICHEVVET_LICENSE_MODE: 'compatibility', GROOMING_STAFF_PUSH_ENABLED: 'false', REMOTE_STAFF_PUBLIC_URL: 'http://localhost:4269', REMOTE_ACCESS_GATEWAY_SECRET: randomBytes(32).toString('hex') });
const require = createRequire(import.meta.url);
const { staffMobileFixture, qaPassword } = await import('./.generated/staff-mobile-fixture.mjs');
const f = await staffMobileFixture();
// Current grooming contract binds the physical workplace to each synthetic shift.
const secondWorkplace = await f.prisma.groomingWorkplace.create({ data: { locationId: f.location.id, name: 'Стол 2 · iOS QA' } });
await f.prisma.groomingWorkPeriod.updateMany({ where: { specialistId: f.specialist.id }, data: { workplaceId: f.workplace.id } });
await f.prisma.groomingWorkPeriod.updateMany({ where: { specialistId: f.secondSpecialist.id }, data: { workplaceId: secondWorkplace.id } });
await f.prisma.groomingServiceRule.updateMany({ where: { specialistId: f.secondSpecialist.id }, data: { workplaceId: secondWorkplace.id } });
const load = name => require(`./.generated/backend/apps/api/dist/${name}.js`);
const { Module, ValidationPipe } = require('@nestjs/common'), { APP_GUARD, NestFactory } = require('@nestjs/core');
const { StaffAppController } = load('modules/staff-app/staff-app.controller'), { StaffAppService } = load('modules/staff-app/staff-app.service');
const { AuthController } = load('modules/auth/auth.controller'), { AuthService } = load('modules/auth/auth.service');
const { RemoteAccessController } = load('modules/remote-access/remote-access.controller'), { RemoteAccessService } = load('modules/remote-access/remote-access.service');
const { SessionAuthGuard } = load('modules/auth/session-auth.guard'), { PermissionsGuard } = load('modules/auth/permissions.guard');
const { InternalMessagesController } = load('modules/internal-messages/internal-messages.controller'), { InternalMessagesService } = load('modules/internal-messages/internal-messages.service');
const { StaffClinicChatService } = load('modules/internal-messages/staff-clinic-chat.service');
const { GroomingController } = load('modules/grooming/grooming.controller'), { GroomingTeamService } = load('modules/grooming/grooming-team.service');
const { PasswordService } = load('modules/auth/password.service');
const { StaffNativePushController } = load('modules/staff-native-push/staff-native-push.controller'), { StaffNativePushService } = load('modules/staff-native-push/staff-native-push.service');
const { PrismaService } = load('prisma/prisma.service'), { AuditService } = load('modules/audit/audit.service'), { GroomingCrmService } = load('modules/grooming/grooming.service');
const remote = new RemoteAccessService(f.prisma, f.audit);
const messages = new InternalMessagesService(f.prisma, f.audit);
const clinicChat = new StaffClinicChatService(f.prisma, f.audit);
const groomingTeam = new GroomingTeamService(f.prisma, f.modules, f.audit, new PasswordService());
const nativePush = new StaffNativePushService(f.prisma, f.auth, f.audit, f.modules);
// This fake director models the ordinary CRM director's calendar permission.
await f.grant(f.director.id, 'appointments.read');
const doctor = await f.configure(f.clinical.id, { clinicBooking: false });
const groomer = await f.configure(f.groomer.id, { groomingBooking: true });
const colleague = await f.doctor('коллега');
const authDoctor = await f.doctor('вход-пароль');
const users = {};
for (const [role, actor] of Object.entries({ doctor, groomer, colleague, otherGroomer: await f.actor(f.otherGroomer.id), director: await f.actor(f.director.id), authDoctor })) {
  const phoneNormalized = '70000000' + String(100 + Object.keys(users).length);
  const user = await f.prisma.user.update({ where: { id: actor.userId }, data: { mustChangePassword: false, phone: '+' + phoneNormalized, phoneNormalized } });
  await f.prisma.employee.update({ where: { id: actor.id }, data: { phone: user.phone } });
  users[role] = { id: actor.id, login: user.phone, password: qaPassword };
}
await f.prisma.remoteAccessPolicy.upsert({ where: { organizationId: 'grooming-qa-organization' }, create: { organizationId: 'grooming-qa-organization', enabled: true }, update: { enabled: true } });
for (const [code, title, breeds] of [['DOG', 'Собака', ['Пудель', 'Метис']], ['CAT', 'Кошка', ['Мейн-кун', 'Метис']]]) {
  await f.prisma.animalSpecies.upsert({ where: { code }, create: { code, title, breeds: { create: breeds.map(title => ({ title })) } }, update: {} });
}
await f.appointments.createAppointment({ ownerId: f.owner.id, animalId: f.animal.id, employeeId: doctor.id, startsAt: `${f.selectedDate}T11:00:00+03:00`, comment: 'Синтетическая запись для iOS' }, doctor.id);
await f.appointments.createAppointment({ ownerId: f.otherOwner.id, animalId: f.otherAnimal.id, employeeId: colleague.id, startsAt: `${f.selectedDate}T13:00:00+03:00`, comment: 'Приём коллеги · синтетическая проверка iOS' }, colleague.id);
await f.prisma.employeeShift.create({ data: { employeeId: doctor.id, startsAt: new Date(`${f.selectedDate}T09:00:00+03:00`), endsAt: new Date(`${f.selectedDate}T20:00:00+03:00`) } });
await f.prisma.internalMessage.create({ data: { senderId: f.director.id, recipientId: doctor.id, body: 'Тестовое сообщение: расписание подтверждено.' } });
await f.prisma.task.create({ data: { title: 'Проверить расписание на следующий день', assigneeId: doctor.id, creatorId: f.director.id } });
const offered = await f.service.options(f.owner.id, f.options);
for (const offer of [offered.offers[0], offered.offers.at(-1)]) await f.service.book(f.owner.id, { clientKey: crypto.randomUUID(), offerToken: offer.offerToken, notes: 'Синтетическая запись для проверки iPhone', looks: [], contactConsent: true, bookingConsent: true });
class QAModule {}
Module({ controllers: [StaffAppController, AuthController, RemoteAccessController, InternalMessagesController, StaffNativePushController, GroomingController], providers: [
  { provide: StaffAppService, useValue: f.mobile }, { provide: GroomingCrmService, useValue: f.service },
  { provide: AuthService, useValue: f.auth }, { provide: RemoteAccessService, useValue: remote }, { provide: PrismaService, useValue: f.prisma }, { provide: AuditService, useValue: f.audit },
  { provide: APP_GUARD, useClass: SessionAuthGuard }, { provide: APP_GUARD, useClass: PermissionsGuard },
  { provide: InternalMessagesService, useValue: messages }, { provide: StaffNativePushService, useValue: nativePush },
  { provide: StaffClinicChatService, useValue: clinicChat }, { provide: GroomingTeamService, useValue: groomingTeam },
] })(QAModule);
const app = await NestFactory.create(QAModule, { logger: false });
app.setGlobalPrefix('api'); app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
let failReads = false, loseNextMutation = false;
const commands = [];
app.use(async (request, response, next) => {
  response.setHeader('Cache-Control', 'no-store');
  const u = new URL(request.url, 'http://localhost');
  try {
    if (u.pathname === '/__qa/info') return response.json({ synthetic: true, date: f.selectedDate, users, owner: { id: f.owner.id, phone: '+' + f.phone, animalId: f.animal.id }, otherAnimal: f.otherAnimal.nickname });
    if (u.pathname === '/__qa/invitation') { const actor = users[u.searchParams.get('role')]; if (!actor) return response.sendStatus(400); return response.json(await remote.createInvitation({ employeeId: actor.id, deviceName: 'iPhone · синтетическая приёмка' }, f.director.id)); }
    if (u.pathname === '/__qa/clinic-booking') { await f.configure(doctor.id, { clinicBooking: u.searchParams.get('enabled') === 'true' }); return response.json({ ok: true }); }
    if (u.pathname === '/__qa/notifications') { await f.configure(users[u.searchParams.get('role') || 'groomer'].id, { notifications: u.searchParams.get('enabled') === 'true' }); return response.json({ ok: true }); }
    if (u.pathname === '/__qa/native-login-policy') {
      const actor = users[u.searchParams.get('role')]; if (!actor) return response.sendStatus(400);
      if (u.searchParams.has('appEnabled')) await f.configure(actor.id, { enabled: u.searchParams.get('appEnabled') === 'true' });
      if (u.searchParams.has('active')) await f.prisma.employee.update({ where: { id: actor.id }, data: { status: u.searchParams.get('active') === 'true' ? 'ACTIVE' : 'BLOCKED' } });
      if (u.searchParams.has('remoteEnabled')) await f.prisma.remoteAccessPolicy.updateMany({ where: { organizationId: 'grooming-qa-organization' }, data: { enabled: u.searchParams.get('remoteEnabled') === 'true' } });
      return response.json({ ok: true });
    }
    if (u.pathname === '/__qa/revoke') { await f.prisma.remoteAccessDevice.updateMany({ where: { employeeId: users[u.searchParams.get('role')].id }, data: { revokedAt: new Date() } }); return response.json({ ok: true }); }
    if (u.pathname === '/__qa/expire') { await f.prisma.session.updateMany({ where: { userId: (await f.actor(users[u.searchParams.get('role')].id)).userId }, data: { expiresAt: new Date(0) } }); return response.json({ ok: true }); }
    if (u.pathname === '/__qa/visit-started') { const id = u.searchParams.get('id'); const own = await f.prisma.groomingReservation.findFirst({ where: { id, employeeId: groomer.id } }); if (!own) return response.sendStatus(404); const start = new Date(Date.now() - 7200000); await f.prisma.groomingReservation.update({ where: { id }, data: { startsAt: start, endsAt: new Date(+start + 3600000), blockedUntil: new Date(+start + 4500000) } }); return response.json({ syntheticClockAdvanced: true }); }
    if (u.pathname === '/__qa/network') { failReads = u.searchParams.get('offline') === 'true'; loseNextMutation = u.searchParams.get('loseNextMutation') === 'true'; return response.json({ ok: true }); }
    if (u.pathname === '/__qa/auth-state') return response.json({ users: await f.prisma.user.count(), employees: await f.prisma.employee.count(), sessions: await f.prisma.session.count(), devices: await f.prisma.remoteAccessDevice.count(), invitations: await f.prisma.remoteAccessInvitation.count() });
    if (u.pathname === '/__qa/state') return response.json({ commands, appointments: await f.prisma.appointment.count(), grooming: await f.prisma.groomingReservation.findMany({ select: { id: true, ownerId: true, animalId: true, employeeId: true, startsAt: true, endsAt: true, status: true, version: true } }), devices: await f.prisma.remoteAccessDevice.count(), messages: await f.prisma.internalMessage.count(), clinicMessages: await f.prisma.staffClinicChatMessage.count(), nativeEvents: await f.prisma.staffNativePushEvent.findMany({ select: { id: true, employeeId: true, kind: true, sourceId: true, channelId: true } }) });
    if (u.pathname.startsWith('/api/')) {
      if (failReads) return request.socket.destroy();
      if (!['GET', 'HEAD'].includes(request.method)) {
        commands.push({ method: request.method, path: u.pathname, at: new Date().toISOString() });
        if (loseNextMutation && u.pathname.includes('/staff-app/')) { loseNextMutation = false; const originalEnd = response.end.bind(response); response.end = (...args) => { request.socket.destroy(); return response; }; response.once('close', () => { response.end = originalEnd; }); }
      }
    }
    next();
  } catch (error) { response.status(400).json({ message: error.message }); }
});
await app.listen(4268, '127.0.0.1');
const gateway = createServer((req, res) => {
  if (!req.url.startsWith('/api/')) { res.writeHead(404); res.end(); return; }
  const headers = { ...req.headers, host: 'localhost:4268', 'x-temichevvet-remote-access': '1', 'x-temichevvet-gateway-secret': process.env.REMOTE_ACCESS_GATEWAY_SECRET };
  const upstream = proxyRequest({ hostname: '127.0.0.1', port: 4268, path: req.url, method: req.method, headers }, source => {
    const h = { ...source.headers };
    // Simulator-only loopback HTTP: remote auth deliberately sets Secure; production app never removes this flag.
    if (h['set-cookie']) h['set-cookie'] = h['set-cookie'].map(cookie => cookie.replace(/; secure/ig, ''));
    res.writeHead(source.statusCode, h); source.pipe(res);
  });
  upstream.on('error', () => res.destroy()); req.pipe(upstream);
});
await new Promise((resolve, reject) => { gateway.once('error', reject); gateway.listen(4269, '127.0.0.1', resolve); });
await writeFile(new URL('./runtime.json', import.meta.url), JSON.stringify({ date: f.selectedDate, users, api: 'http://127.0.0.1:4268', gateway: 'http://localhost:4269', schema: 'staff_ios_qa_20261028' }, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ syntheticReady: true, schema: 'staff_ios_qa_20261028', apiPort: 4268, gatewayPort: 4269, date: f.selectedDate, externalDelivery: false }));
let closing = false;
async function close() { if (closing) return; closing = true; gateway.close(); await app.close(); await f.close(); process.exit(0); }
process.on('SIGINT', close); process.on('SIGTERM', close); process.stdin.on('data', d => { if (d.toString().trim() === 'stop') void close(); });
