import 'reflect-metadata';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { configureHotelQa, hotelQaApp } from './pet-hotel-qa-app.mjs';
const require = createRequire(import.meta.url), exec = promisify(execFile);
export const integratedPassword = 'SyntheticHotelOnly2026!';
export const integratedSecret = 'synthetic-integrated-hotel-gateway-20261020-only';
export function configureIntegratedHotel(preview = false) {
  configureHotelQa();
  const suffix = preview ? 'preview' : 'tests';
  const clinic = `pet_hotel_integrated_${suffix}_20261020_qa`, gateway = `pet_hotel_integrated_gateway_${suffix}_20261020_qa`;
  Object.assign(process.env, {
    DATABASE_URL: `postgresql://grooming_module_qa:synthetic-grooming-only@127.0.0.1:55440/${clinic}`,
    OWNER_GATEWAY_DATABASE_URL: `postgresql://grooming_module_qa:synthetic-grooming-only@127.0.0.1:55440/${gateway}`,
    OWNER_GATEWAY_SYNC_SECRET: integratedSecret, OWNER_GATEWAY_SESSION_COOKIE: 'integrated_hotel_owner_qa',
    SESSION_COOKIE_NAME: 'integrated_hotel_staff_qa',
    OWNER_GATEWAY_PUBLIC_URL: 'http://127.0.0.1:4333', PET_HOTEL_SITE_ORIGINS: 'http://127.0.0.1:4274',
    OWNER_GATEWAY_PUBLIC_SITE_ORIGINS: 'http://127.0.0.1:4274', PET_HOTEL_CRM_SYNC_ENABLED: 'false',
    PET_HOTEL_CLIENT_NOTIFICATIONS_ENABLED: 'false', GROOMING_CLIENT_NOTIFICATIONS_ENABLED: 'false',
    MAX_BOT_USERNAME: 'hotel-qa-no-external-send', MAX_WEBHOOK_SECRET: integratedSecret,
    CLINIC_ASSISTANT_REMINDERS_ENABLED: 'false', WEB_PUSH_ENABLED: 'false',
  });
  return { clinic, gateway, preview };
}
export async function prepareIntegratedHotelDb(names) {
  const admin = (await exec('docker', ['exec', 'crm-grooming-qa-20261019', 'printenv', 'POSTGRES_USER'])).stdout.trim();
  if (!/^[A-Za-z0-9_]+$/.test(admin)) throw Error('Invalid QA database administrator');
  for (const [name, schema] of [[names.clinic, 'prisma/schema.prisma'], [names.gateway, 'apps/owner-gateway/prisma/schema.prisma']]) {
    if (!/^pet_hotel_integrated_(?:gateway_)?(?:preview|tests)_20261020_qa$/.test(name)) throw Error('Only the dedicated hotel QA databases are allowed');
    const exists = await exec('docker', ['exec', 'crm-grooming-qa-20261019', 'psql', '-U', admin, '-d', 'postgres', '-tAc', `SELECT 1 FROM pg_database WHERE datname='${name}'`]);
    if (!exists.stdout.trim()) await exec('docker', ['exec', 'crm-grooming-qa-20261019', 'createdb', '-U', admin, '-O', 'grooming_module_qa', name]);
    await exec(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', schema], { env: process.env, maxBuffer: 2000000 });
  }
}
export async function integratedHotelFixture(names) {
  const { PrismaClient } = require('@prisma/client'), { PasswordService } = require('../../apps/api/dist/modules/auth/password.service.js');
  const prisma = new PrismaClient();
  const u = new URL(process.env.DATABASE_URL);
  if (u.hostname !== '127.0.0.1' || u.port !== '55440' || u.pathname !== '/' + names.clinic || !/^pet_hotel_integrated_(preview|tests)_20261020_qa$/.test(names.clinic)) throw Error('Wrong synthetic hotel database');
  if (!names.preview) {
    const tables = await prisma.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
    await prisma.$executeRawUnsafe('TRUNCATE ' + tables.map(t => '"' + t.tablename.replaceAll('"', '""') + '"').join(',') + ' CASCADE');
  }
  const organization = await prisma.organization.upsert({ where: { id: 'hotel-integrated-qa-org' }, create: { id: 'hotel-integrated-qa-org', displayName: 'Зоогостиница · вымышленная QA клиника' }, update: {} });
  for (const code of ['pet_hotel.read', 'pet_hotel.operate', 'pet_hotel.manage', 'modules.manage', 'grooming.read', 'grooming.operate']) await prisma.permission.upsert({ where: { code }, create: { code, title: code }, update: {} });
  const passwordHash = await new PasswordService().hashPassword(integratedPassword), staff = {};
  for (const [code, permissions] of [['director', ['pet_hotel.read', 'pet_hotel.operate', 'pet_hotel.manage', 'modules.manage']], ['pet_hotel_operator', ['pet_hotel.read', 'pet_hotel.operate']], ['groomer', ['grooming.read', 'grooming.operate']]]) {
    const role = await prisma.role.upsert({ where: { code }, create: { code, title: 'QA · ' + code }, update: {} });
    for (const code of permissions) { const p = await prisma.permission.findUniqueOrThrow({ where: { code } }); await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: p.id } }, create: { roleId: role.id, permissionId: p.id }, update: {} }); }
    const email = `integrated-hotel-${code}@example.local`;
    const user = await prisma.user.upsert({ where: { email }, create: { email, passwordHash }, update: { passwordHash } });
    const employee = await prisma.employee.upsert({ where: { userId: user.id }, create: { userId: user.id, fullName: `QA · ${code}`, defaultRoute: code === 'groomer' ? '/grooming' : '/pet-hotel', roles: { create: { roleId: role.id } } }, update: {} });
    staff[code] = { ...employee, userId: user.id, email, roles: [code], permissions };
  }
  const owners = [];
  for (const [id, fullName, phone] of [['integrated-hotel-owner-a', 'Елена · локальная QA', '+79990000611'], ['integrated-hotel-owner-b', 'Павел · локальная QA', '+79990000612']]) {
    const owner = await prisma.owner.upsert({ where: { id }, create: { id, fullName, phone, allowMax: false }, update: {} });
    await prisma.clientPortalAccess.upsert({ where: { ownerId: owner.id }, create: { ownerId: owner.id, status: 'ENABLED' }, update: {} });
    const animalId = id + '-cat';
    const animal = await prisma.animal.upsert({ where: { id: animalId }, create: { id: animalId, ownerId: owner.id, nickname: 'Мурка · локальная QA', species: 'Кошка' }, update: {} });
    owners.push({ ...owner, animal });
  }
  const app = await hotelQaApp();
  const hotel = app.get(require('../../apps/api/dist/modules/pet-hotel/pet-hotel.service.js').PetHotelService);
  const ownerService = app.get(require('../../apps/api/dist/modules/pet-hotel/pet-hotel-portal.service.js').PetHotelOwnerService);
  const sync = app.get(require('../../apps/api/dist/modules/pet-hotel/pet-hotel-sync.service.js').PetHotelSyncService);
  const installation = await hotel.context();
  await prisma.clinicModuleInstallation.update({ where: { id: installation.installation.id }, data: { enabled: true } });
  await hotel.setupRooms('integrated-qa-setup-12', staff.director);
  await prisma.petHotelSettings.update({ where: { installationId: installation.installation.id }, data: { selfBookingEnabled: true, administratorMaxIds: ['999999001'] } });
  const rooms = (await hotel.overview(staff.director)).rooms;
  return { app, prisma, hotel, ownerService, sync, staff, owners, rooms, organization, installation: installation.installation, async close() { app.getHttpServer()?.closeAllConnections?.(); await app.close(); await prisma.$disconnect(); } };
}
export async function integratedGateway(names, port = 0) {
  const { Module, ValidationPipe } = require('@nestjs/common'), { NestFactory } = require('@nestjs/core');
  const { PetHotelModule } = require('../../apps/owner-gateway/dist/pet-hotel/pet-hotel.module.js');
  const { PrismaService } = require('../../apps/owner-gateway/dist/prisma.service.js');
  const { PortalPageController } = require('../../apps/owner-gateway/dist/portal-page.controller.js');
  const { PortalController } = require('../../apps/owner-gateway/dist/portal.controller.js');
  const { PortalService } = require('../../apps/owner-gateway/dist/portal.service.js');
  const { WebPushService } = require('../../apps/owner-gateway/dist/web-push.service.js');
  class IntegratedGateway {}
  Module({ imports: [PetHotelModule], controllers: [PortalPageController, PortalController], providers: [PrismaService, PortalService, WebPushService] })(IntegratedGateway);
  const app = await NestFactory.create(IntegratedGateway, { logger: false });
  app.enableCors({ origin: ['http://127.0.0.1:4274'], credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(port, '127.0.0.1');
  const origin = await app.getUrl();
  process.env.OWNER_GATEWAY_PUBLIC_URL = origin; process.env.OWNER_GATEWAY_URL = origin;
  const prisma = app.get(PrismaService), url = new URL(process.env.OWNER_GATEWAY_DATABASE_URL);
  if (url.hostname !== '127.0.0.1' || url.port !== '55440' || url.pathname !== '/' + names.gateway) throw Error('Wrong synthetic gateway');
  if (!names.preview) {
    if (url.pathname !== '/pet_hotel_integrated_gateway_tests_20261020_qa') throw Error('Only the disposable integrated gateway database may reset');
    const tables = await prisma.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
    await prisma.$executeRawUnsafe('TRUNCATE ' + tables.map(t => '"' + t.tablename.replaceAll('"', '""') + '"').join(',') + ' CASCADE');
  }
  return { app, prisma, origin, async ownerCookie(owner) {
    await prisma.ownerSnapshot.upsert({ where: { ownerId: owner.id }, create: { ownerId: owner.id, displayName: owner.fullName, payload: { owner: { id: owner.id, fullName: owner.fullName }, animals: [owner.animal], appointments: [], bills: [], messages: [], documents: [] }, sourceVersion: 'integrated-hotel-qa', sourceUpdatedAt: new Date() }, update: {} });
    const token = randomBytes(32).toString('hex');
    await prisma.portalSession.create({ data: { ownerId: owner.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3600000) } });
    return `integrated_hotel_owner_qa=${token}`;
  }, async close() { app.getHttpServer().closeAllConnections(); await app.close(); } };
}
export const hotelOperation = (ownerId, kind, input, changes = {}) => ({ id: randomUUID(), ownerId, kind, input, expiresAt: new Date(Date.now() + 600000).toISOString(), ...changes });
