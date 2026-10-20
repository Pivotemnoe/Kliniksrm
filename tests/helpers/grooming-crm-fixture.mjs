import 'reflect-metadata';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const { PrismaClient: GatewayPrismaClient } = require('../../apps/owner-gateway/dist/generated/client/index.js');
const { GroomingCrmService } = require('../../apps/api/dist/modules/grooming/grooming.service.js');
const { GroomingSyncService } = require('../../apps/api/dist/modules/grooming/grooming-sync.service.js');
const { ClinicModulesService } = require('../../apps/api/dist/modules/clinic-modules/clinic-modules.service.js');
const { AuditService } = require('../../apps/api/dist/modules/audit/audit.service.js');
const { GroomingPortalService } = require('../../apps/owner-gateway/dist/grooming/grooming-portal.service.js');
const { OwnerNotificationService } = require('../../apps/owner-gateway/dist/owner-notification.service.js');
const { PasswordService } = require('../../apps/api/dist/modules/auth/password.service.js');
const { hashToken } = require('../../apps/owner-gateway/dist/security.js');
export const crmUrl = 'postgresql://grooming_module_qa:synthetic-grooming-only@127.0.0.1:55440/avito_merge_grooming_crm_20261020';
export const portalUrl = 'postgresql://grooming_module_qa:synthetic-grooming-only@127.0.0.1:55440/avito_merge_grooming_portal_20261020';
export const qaSecret = 'grooming-local-isolated-qa-secret-20261019';
export const qaPassword = 'LocalGrooming2026!';
export function assertGroomingDatabase(value, name) { const u = new URL(value); if (u.hostname !== '127.0.0.1' || u.port !== '55440' || u.pathname !== `/${name}` || u.username !== 'grooming_module_qa') throw new Error('Only the dedicated grooming module QA database is allowed'); }
export class FakeCurrentMax {
  sent = []; fail = false;
  async sendMessage(userId, text, destination) { const receipt = { messageId: 'qa-max-' + randomUUID(), userId, text, destination, at: new Date().toISOString() }; this.sent.push(receipt); if (this.fail) throw new Error('Synthetic response lost after provider acceptance'); return receipt; }
  async sendStaffMessage(userId, text) { return this.sendMessage(userId, text, 'staff'); }
  async sendPortalButton() { throw new Error('Unexpected live invitation transport'); }
}
export async function groomingFixture({ fixed = false, preview = false, device = false } = {}) {
  const crmName = device ? 'grooming_crm_device_qa' : preview ? 'grooming_crm_integration_preview' : 'avito_merge_grooming_crm_20261020';
  const portalName = device ? 'grooming_portal_device_qa' : preview ? 'grooming_portal_integration_preview' : 'avito_merge_grooming_portal_20261020';
  const activeCrmUrl = crmUrl.replace('avito_merge_grooming_crm_20261020', crmName);
  const activePortalUrl = portalUrl.replace('avito_merge_grooming_portal_20261020', portalName);
  assertGroomingDatabase(activeCrmUrl, crmName); assertGroomingDatabase(activePortalUrl, portalName);
  const prisma = new PrismaClient({ datasources: { db: { url: activeCrmUrl } } });
  const gateway = new GatewayPrismaClient({ datasources: { db: { url: activePortalUrl } } });
  const prefix = fixed ? 'grooming-browser' : `grooming-test-${randomUUID()}`;
  await prisma.organization.upsert({ where: { id: 'grooming-qa-organization' }, create: { id: 'grooming-qa-organization', displayName: 'Груминг · локальная проверка', createdAt: new Date('2020-01-01') }, update: {} });
  const permissions = await prisma.permission.findMany({ where: { OR: [{ code: { startsWith: 'grooming.' } }, { code: 'modules.manage' }] } });
  for (const code of ['director', 'administrator', 'groomer']) {
    const role = await prisma.role.upsert({ where: { code }, create: { code, title: { director: 'Директор', administrator: 'Администратор', groomer: 'Грумер' }[code] }, update: {} });
    for (const permission of permissions.filter(p => code === 'director' || (code === 'administrator' ? ['grooming.read', 'grooming.operate', 'grooming.schedule'].includes(p.code) : ['grooming.read', 'grooming.operate'].includes(p.code)))) await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, create: { roleId: role.id, permissionId: permission.id }, update: {} });
  }
  const passwordHash = await new PasswordService().hashPassword(qaPassword);
  const employees = [];
  for (const [suffix, roleCode, fullName] of [['director', 'director', 'Директор · проверка груминга'], ['administrator', 'administrator', 'Администратор · проверка груминга'], ['groomer', 'groomer', 'Анна · тестовый грумер'], ['groomer-two', 'groomer', 'Мария · тестовый грумер']]) {
    const email = `${prefix}-${suffix}@example.local`, role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
    const user = await prisma.user.upsert({ where: { email }, create: { email, passwordHash }, update: { passwordHash } });
    const employee = await prisma.employee.upsert({ where: { userId: user.id }, create: { userId: user.id, fullName, status: 'ACTIVE', defaultRoute: '/grooming', roles: { create: { roleId: role.id } } }, update: {} });
    employees.push({ ...employee, email, roles: [roleCode], permissions: permissions.filter(p => roleCode === 'director' || (roleCode === 'administrator' ? ['grooming.read', 'grooming.operate', 'grooming.schedule'].includes(p.code) : ['grooming.read', 'grooming.operate'].includes(p.code))).map(p => p.code) });
  }
  const [director, administrator, groomer, otherGroomer] = employees;
  const audit = new AuditService(prisma), license = { enforcementActive: false, status: 'COMPATIBILITY', features: [] };
  const modules = new ClinicModulesService(prisma, audit, { getLicenseState: async () => license });
  const installation = await modules.installation('GROOMING');
  await prisma.clinicModuleInstallation.update({ where: { id: installation.id }, data: { enabled: true } });
  const settings = await prisma.groomingSettings.upsert({ where: { installationId: installation.id }, create: { installationId: installation.id, selfBookingEnabled: true, administratorMaxIds: ['990000001'], reminderHours: [24, 2] }, update: { selfBookingEnabled: true } });
  const service = new GroomingCrmService(prisma, modules, audit), sync = new GroomingSyncService(prisma, service);
  const max = new FakeCurrentMax(), notifications = new OwnerNotificationService(gateway, max), portal = new GroomingPortalService(gateway, max, notifications);
  const location = await prisma.groomingLocation.create({ data: { installationId: installation.id, name: 'Груминг · тестовая студия', address: 'Вымышленный адрес для локальной проверки', timezone: 'Europe/Moscow' } });
  const workplace = await prisma.groomingWorkplace.create({ data: { locationId: location.id, name: 'Стол 1 · тестовый' } });
  const groomingService = await prisma.groomingService.create({ data: { installationId: installation.id, title: 'Комплекс ухода · тестовая услуга', price: '2500.00' } });
  const specialist = await prisma.groomingSpecialist.upsert({ where: { employeeId: groomer.id }, create: { installationId: installation.id, employeeId: groomer.id, displayName: 'Анна · тестовый грумер', species: ['DOG', 'CAT'], maxUserId: '990000002' }, update: {} });
  const secondSpecialist = await prisma.groomingSpecialist.upsert({ where: { employeeId: otherGroomer.id }, create: { installationId: installation.id, employeeId: otherGroomer.id, displayName: 'Мария · тестовый грумер', species: ['DOG', 'CAT'], maxUserId: '990000003' }, update: {} });
  let selectedDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + 3 * 86400000));
  if (fixed) {
    while (await prisma.groomingWorkPeriod.findFirst({ where: { specialistId: { in: [specialist.id, secondSpecialist.id] }, startsAt: { lt: new Date(Date.parse(selectedDate + 'T09:00:00+03:00') + 5 * 86400000) }, endsAt: { gt: new Date(selectedDate + 'T09:00:00+03:00') } } })) selectedDate = new Date(Date.parse(selectedDate + 'T12:00:00+03:00') + 5 * 86400000).toISOString().slice(0,10);
  }
  for (const profile of [specialist, secondSpecialist]) for (let i = 0; i < 5; i++) {
    const date = new Date(`${selectedDate}T12:00:00+03:00`); date.setUTCDate(date.getUTCDate() + i); const d = date.toISOString().slice(0, 10);
    await prisma.groomingWorkPeriod.create({ data: { specialistId: profile.id, locationId: location.id, startsAt: new Date(`${d}T09:00:00+03:00`), endsAt: new Date(`${d}T20:00:00+03:00`) } });
  }
  const ruleData = { installationId: installation.id, specialistId: specialist.id, serviceId: groomingService.id, locationId: location.id, workplaceId: workplace.id, species: 'DOG', size: 'ANY', coat: 'ANY', durationMinutes: 90, bufferMinutes: 15, stepMinutes: 15, minimumLeadMinutes: 0, maximumDaysAhead: 30, isActive: true };
  const rule = await prisma.groomingServiceRule.create({ data: ruleData });
  await prisma.groomingServiceRule.create({ data: { ...ruleData, specialistId: secondSpecialist.id } });
  await prisma.groomingServiceRule.create({ data: { ...ruleData, species: 'CAT', durationMinutes: 60 } });
  const owner = await prisma.owner.create({ data: { fullName: 'Ирина · тестовый владелец', phone: '+79990000001', phoneNormalized: '79990000001', maxUserId: `${Date.now()}01`, allowMax: true, portalAccess: { create: { status: 'ENABLED' } } } });
  const otherOwner = await prisma.owner.create({ data: { fullName: 'Олег · другой тестовый владелец', phone: '+79990000002', portalAccess: { create: { status: 'ENABLED' } } } });
  const animal = await prisma.animal.create({ data: { ownerId: owner.id, nickname: 'Тедди · тест', species: 'Собака', breed: 'Пудель' } });
  const otherAnimal = await prisma.animal.create({ data: { ownerId: otherOwner.id, nickname: 'Бим · тест', species: 'Собака', breed: 'Хаски' } });
  const cat = await prisma.animal.create({ data: { ownerId: owner.id, nickname: 'Луна · тест', species: 'Кошка', breed: 'Мейн-кун' } });
  for (const person of [owner, otherOwner]) {
    const animals = await prisma.animal.findMany({ where: { ownerId: person.id } });
    await gateway.ownerSnapshot.create({ data: { ownerId: person.id, displayName: person.fullName, payload: { owner: { id: person.id, fullName: person.fullName, phone: person.phone }, animals: JSON.parse(JSON.stringify(animals)) }, sourceVersion: 'grooming-local-qa', sourceUpdatedAt: new Date() } });
    await gateway.messengerBinding.create({ data: { ownerId: person.id, channel: 'MAX', externalUserId: `${Date.now()}${person.id.slice(0, 6).replace(/\D/g, '') || '33'}` } });
    await gateway.ownerNotificationPreference.create({ data: { ownerId: person.id, quietStartMinute: 0, quietEndMinute: 0 } });
  }
  const sessionToken = randomUUID() + randomUUID();
  await gateway.portalSession.create({ data: { ownerId: owner.id, tokenHash: hashToken(sessionToken), expiresAt: new Date(Date.now() + 86400000) } });
  const options = { animalId: animal.id, serviceId: groomingService.id, specialistId: specialist.id, species: 'DOG', size: 'SMALL', coat: 'ANY', date: selectedDate };
  const close = async () => { await prisma.$disconnect(); await gateway.$disconnect(); };
  return { prisma, gateway, prefix, director, administrator, groomer, otherGroomer, service, sync, modules, audit, license, installation, settings, location, workplace, groomingService, specialist, secondSpecialist, rule, owner, otherOwner, animal, otherAnimal, cat, portal, notifications, max, sessionToken, options, selectedDate, close };
}
