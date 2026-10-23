import 'reflect-metadata';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const { PetHotelService } = require('../../apps/api/dist/modules/pet-hotel/pet-hotel.service.js');
const { ClinicModulesService } = require('../../apps/api/dist/modules/clinic-modules/clinic-modules.service.js');
const { AuditService } = require('../../apps/api/dist/modules/audit/audit.service.js');
const { PasswordService } = require('../../apps/api/dist/modules/auth/password.service.js');
export const qaPassword = 'LocalHotel2026!';
export const hotelDb = name => `postgresql://grooming_module_qa:synthetic-grooming-only@127.0.0.1:55440/${name}`;
export function assertHotelDatabase(url, preview = false) {
  const u = new URL(url);
  const names = preview ? ['pet_hotel_preview_20261020_qa', 'pet_hotel_client_tariffs_preview_20261023_qa'] : ['pet_hotel_tests_20261020_qa_v2'];
  if (u.hostname !== '127.0.0.1' || u.port !== '55440' || u.username !== 'grooming_module_qa' || !names.some(name => u.pathname === `/${name}`)) throw Error('Only the dedicated synthetic pet hotel database is allowed');
}
export async function hotelFixture({ preview = false, databaseName } = {}) {
  const url = hotelDb(databaseName || (preview ? 'pet_hotel_preview_20261020_qa' : 'pet_hotel_tests_20261020_qa_v2')); assertHotelDatabase(url, preview);
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  if (!preview) { await prisma.petHotelNotification.deleteMany(); await prisma.petHotelCommandReceipt.deleteMany(); await prisma.petHotelReservation.deleteMany(); await prisma.petHotelRoom.deleteMany(); await prisma.petHotelSettings.deleteMany(); }
  await prisma.organization.upsert({ where: { id: 'hotel-module-unit-qa-org' }, create: { id: 'hotel-module-unit-qa-org', displayName: 'Тест зоогостиницы · синтетические данные' }, update: {} });
  const passwordHash = await new PasswordService().hashPassword(qaPassword);
  const people = {};
  for (const [label, code, fullName] of [['director','director','Директор · локальная проверка'], ['administrator','administrator','Администратор · локальная проверка'], ['viewer','pet_hotel_qa_viewer','Наблюдатель · локальная проверка'], ['groomer','groomer','Грумер · локальная проверка']]) {
    const role = await prisma.role.upsert({ where: { code }, create: { code, title: fullName }, update: {} });
    if (['director','administrator'].includes(label)) {
      const codes=label==='director'?['pet_hotel.read','pet_hotel.operate','pet_hotel.manage','modules.manage']:['pet_hotel.read','pet_hotel.operate','pet_hotel.manage'];
      for(const code of codes){ const permission=await prisma.permission.upsert({where:{code},create:{code,title:code},update:{}});await prisma.rolePermission.upsert({where:{roleId_permissionId:{roleId:role.id,permissionId:permission.id}},create:{roleId:role.id,permissionId:permission.id},update:{}}); }
      const avito = await prisma.permission.findMany({where:{code:{startsWith:'avito.'}}});
      for(const permission of avito.filter(p => label === 'director' || p.code === 'avito.read')) await prisma.rolePermission.upsert({where:{roleId_permissionId:{roleId:role.id,permissionId:permission.id}},create:{roleId:role.id,permissionId:permission.id},update:{}});
    }
    if (label === 'viewer') { const permission = await prisma.permission.findUniqueOrThrow({ where: { code: 'pet_hotel.read' } }); await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, create: { roleId: role.id, permissionId: permission.id }, update: {} }); }
    const email = `hotel-qa-${label}@example.local`;
    const user = await prisma.user.upsert({ where: { email }, create: { email, passwordHash }, update: { passwordHash } });
    const e = await prisma.employee.upsert({ where: { userId: user.id }, create: { userId: user.id, fullName, status: 'ACTIVE', defaultRoute: '/pet-hotel', roles: { create: { roleId: role.id } } }, update: { defaultRoute: label === 'groomer' ? '/grooming' : '/pet-hotel' } });
    const permissions = (await prisma.rolePermission.findMany({ where: { roleId: role.id }, include: { permission: true } })).map(p => p.permission.code);
    people[label] = { ...e, email, roles: [code], permissions };
  }
  const owner = (preview ? await prisma.owner.findFirst({where:{fullName:'Елена · Зоогостиница QA'}}) : null) || await prisma.owner.create({ data: { fullName: 'Елена · Зоогостиница QA', phone: '+79990000412' } });
  const otherOwner = (preview ? await prisma.owner.findFirst({where:{fullName:'Павел · Зоогостиница QA'}}) : null) || await prisma.owner.create({ data: { fullName: 'Павел · Зоогостиница QA', phone: '+79990000413' } });
  const animal = (preview ? await prisma.animal.findFirst({where:{ownerId:owner.id,nickname:'Луна · гостиница QA'}}) : null) || await prisma.animal.create({ data: { ownerId: owner.id, nickname: 'Луна · гостиница QA', species: 'Кошка' } });
  const otherAnimal = (preview ? await prisma.animal.findFirst({where:{ownerId:otherOwner.id,nickname:'Мурка · гостиница QA'}}) : null) || await prisma.animal.create({ data: { ownerId: otherOwner.id, nickname: 'Мурка · гостиница QA', species: 'Кошка' } });
  const dog = (preview ? await prisma.animal.findFirst({where:{ownerId:owner.id,nickname:'Тедди · гостиница QA'}}) : null) || await prisma.animal.create({ data: { ownerId: owner.id, nickname: 'Тедди · гостиница QA', species: 'Собака', breed: 'Пудель' } });
  const audit = new AuditService(prisma), license = { enforcementActive: false, status: 'COMPATIBILITY', features: [] };
  const modules = new ClinicModulesService(prisma, audit, { getLicenseState: async () => license });
  await modules.catalog();
  const service = new PetHotelService(prisma, modules, audit), installation = await modules.installation('PET_HOTEL');
  await prisma.clinicModuleInstallation.update({ where: { id: installation.id }, data: { enabled: true } });
  await service.setupRooms(randomUUID(), people.director);
  const rooms = (await service.overview(people.director)).rooms;
  const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0,10);
  const start = new Date(`${day}T10:00:00+03:00`), now = new Date(start.getTime() - 86400000);
  const booking = changes => ({ clientKey: randomUUID(), ownerId: owner.id, animalId: animal.id, roomId: rooms.find(r => r.code === 'CAT-1').id, startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 51 * 3600000).toISOString(), walkCount: 0, notes: 'Только тестовые данные', ...changes });
  return { ...people, prisma, modules, service, license, installation, owner, otherOwner, animal, otherAnimal, dog, rooms, start, now, booking, close: () => prisma.$disconnect() };
}
