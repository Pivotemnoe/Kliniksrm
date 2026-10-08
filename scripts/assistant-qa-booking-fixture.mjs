// Creates only fictional records in the explicitly isolated QA databases.
import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { PrismaClient as GatewayDb } from '../apps/owner-gateway/src/generated/client/index.js';
import { hashToken } from '../apps/owner-gateway/dist/security.js';
import { writeFile } from 'node:fs/promises';
const db = new PrismaClient({ datasources: { db: { url: 'postgresql://crm_qa:synthetic-qa-only@127.0.0.1:15488/crm_assistant_qa' } } });
const gateway = new GatewayDb({ datasources: { db: { url: 'postgresql://crm_qa:synthetic-qa-only@127.0.0.1:15488/crm_assistant_gateway_qa' } } });
try {
  const org = await db.organization.create({ data: { displayName: 'Синтетический браузерный QA записи' } });
  const workingHours = Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day => [day, { isWorking: true, is24Hours: true }]));
  const office = await db.clinicOffice.create({ data: { organizationId: org.id, name: 'Браузер QA — филиал', timezone: 'Europe/Moscow', workingHours } });
  const room = await db.room.create({ data: { officeId: office.id, name: 'Браузер QA — кабинет' } });
  const owner = await db.owner.create({ data: { fullName: 'Браузер QA — владелец', phone: '+79990000009' } });
  const animal = await db.animal.create({ data: { ownerId: owner.id, nickname: 'Браузер QA — кот' } });
  const role = await db.role.upsert({ where: { code: 'doctor' }, create: { code: 'doctor', title: 'Врач (тест)' }, update: {} });
  const doctor = await db.employee.create({ data: { fullName: 'Браузер QA — врач', roles: { create: { roleId: role.id } } } });
  const service = await db.service.create({ data: { title: 'Браузер QA — плановый осмотр', isActive: true, publicOnWebsite: true } });
  const startsAt = new Date(Math.ceil((Date.now() + 3600_000) / 900_000) * 900_000);
  await db.employeeShift.create({ data: { employeeId: doctor.id, startsAt, endsAt: new Date(startsAt.getTime() + 3 * 3600_000) } });
  await gateway.ownerSnapshot.create({ data: { ownerId: owner.id, displayName: owner.fullName, payload: {}, sourceVersion: 'synthetic-browser-qa', sourceUpdatedAt: new Date() } });
  // Publicly documented fake credential, valid only in this throwaway QA database.
  const fakePortalToken = 'synthetic-portal-autobooking-qa-only-20261008';
  await gateway.portalSession.upsert({ where: { tokenHash: hashToken(fakePortalToken) }, create: { ownerId: owner.id, tokenHash: hashToken(fakePortalToken), expiresAt: new Date(Date.now() + 6 * 3600_000) }, update: { ownerId: owner.id, expiresAt: new Date(Date.now() + 6 * 3600_000), revokedAt: null } });
  const result = { officeId: office.id, roomId: room.id, ownerId: owner.id, animalId: animal.id, doctorId: doctor.id, serviceId: service.id, startsAt: startsAt.toISOString(), synthetic: true };
  await writeFile('outputs/assistant-20261008/booking-browser-fixture.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} finally { await db.$disconnect(); await gateway.$disconnect(); }
