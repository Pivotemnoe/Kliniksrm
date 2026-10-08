// Explicitly synthetic, isolated local QA. Never imports .env or connects to a clinic DB.
import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
const qaUrl = 'postgresql://crm_qa:synthetic-qa-only@127.0.0.1:15488/crm_assistant_qa';
Object.assign(process.env, {
  DATABASE_URL: qaUrl, NODE_ENV: 'test', CLINIC_RUNTIME_MODE: 'test',
  APP_URL: 'http://127.0.0.1:4310', SESSION_SECRET: randomBytes(32).toString('hex'),
  SESSION_COOKIE_NAME: 'crm_assistant_qa_session', SESSION_COOKIE_SECURE: 'false',
  CLINIC_ASSISTANT_ENABLED: 'true',
  CLINIC_ASSISTANT_AUTO_BOOKING_ENABLED: 'true',
  CLINIC_ASSISTANT_BOOKING_SIGNING_SECRET: 'synthetic-offer-signing-secret-only-20261008',
  OWNER_GATEWAY_URL: 'http://127.0.0.1:4312', OWNER_GATEWAY_SYNC_SECRET: 'synthetic-qa-gateway-secret-only-20261008', MAX_BOT_TOKEN: '', TELEGRAM_BOT_TOKEN: '',
  OWNER_GATEWAY_BOOKING_SYNC_ENABLED: 'false', CLINIC_SITE_CATALOG_SYNC_ENABLED: 'false',
  TEMICHEVVET_LICENSE_MODE: 'compatibility', API_DOCS_ENABLED: 'false', SEED_ON_START: 'false',
});
const { PrismaClient } = await import('@prisma/client');
const { PasswordService } = await import('../apps/api/dist/modules/auth/password.service.js');
const db = new PrismaClient({ datasources: { db: { url: qaUrl } } });
const hash = await new PasswordService().hashPassword('SyntheticQA123!');
const role = await db.role.upsert({ where: { code: 'administrator' }, create: { code: 'administrator', title: 'Администратор (тест)' }, update: {} });
for (const code of ['settings.read', 'settings.manage', 'appointments.manage', 'appointments.read', 'news.read', 'owners.read', 'animals.read', 'dashboard.read', 'queue.read', 'visits.read', 'visits.manage', 'notifications.manage', 'notifications.read']) {
  const p = await db.permission.upsert({ where: { code }, create: { code, title: code }, update: {} });
  await db.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: p.id } }, create: { roleId: role.id, permissionId: p.id }, update: {} });
}
for (const index of [1, 2]) {
  const email = `admin${index}@assistant-qa.invalid`;
  const user = await db.user.upsert({ where: { email }, create: { email, passwordHash: hash }, update: { passwordHash: hash } });
  const employee = await db.employee.upsert({ where: { userId: user.id }, create: { userId: user.id, fullName: `Администратор тест ${index}`, defaultRoute: '/online-requests' }, update: {} });
  await db.employeeRole.upsert({ where: { employeeId_roleId: { employeeId: employee.id, roleId: role.id } }, create: { employeeId: employee.id, roleId: role.id }, update: {} });
}
await db.onlineAppointmentRequest.upsert({ where: { externalRequestId: 'assistant-ui-fixture-1' }, create: {
  externalRequestId: 'assistant-ui-fixture-1', ownerName: 'Тестовый владелец', phone: '+79990000001', animalNickname: 'Тестовый кот',
  source: 'SITE_CHAT', comment: 'Хочу записаться на плановый осмотр. Синтетическая заявка.',
}, update: {} });
await db.$disconnect();
const { NestFactory } = await import('@nestjs/core');
const { ValidationPipe } = await import('@nestjs/common');
const { AppModule } = await import('../apps/api/dist/app.module.js');
const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
app.setGlobalPrefix('api');
app.enableCors({ origin: 'http://127.0.0.1:4310', credentials: true });
app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
await app.listen(4311, '127.0.0.1');
console.log('Synthetic CRM API ready at http://127.0.0.1:4311; QA accounts admin1/admin2@assistant-qa.invalid');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await app.close(); process.exit(0); });
