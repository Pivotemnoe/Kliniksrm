// Creates only synthetic records in the explicitly isolated local databases.
import 'reflect-metadata';
import { writeFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { PrismaClient as GatewayDb } from '../apps/owner-gateway/src/generated/client/index.js';
import { hashToken } from '../apps/owner-gateway/dist/security.js';
import { ClientPortalService } from '../apps/api/dist/modules/client-portal/client-portal.service.js';
const db = new PrismaClient({ datasources: { db: { url: 'postgresql://crm_qa:synthetic-qa-only@127.0.0.1:15488/crm_assistant_qa' } } });
const gateway = new GatewayDb({ datasources: { db: { url: 'postgresql://crm_qa:synthetic-qa-only@127.0.0.1:15488/crm_assistant_gateway_qa' } } });
try {
  const org = await db.organization.create({ data: { displayName: 'Диалог — вымышленная клиника' } });
  const workingHours = Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day => [day, { isWorking: true, is24Hours: true }]));
  const office = await db.clinicOffice.create({ data: { organizationId: org.id, name: 'Диалог QA — филиал', timezone: 'Europe/Moscow', workingHours } });
  const room = await db.room.create({ data: { officeId: office.id, name: 'Диалог QA — кабинет' } });
  const owner = await db.owner.create({ data: { fullName: 'Диалог QA — владелец', phone: '+79990000009' } });
  const animal = await db.animal.create({ data: { ownerId: owner.id, nickname: 'Диалог QA — кот' } });
  await db.clientPortalAccess.create({ data: { ownerId: owner.id, status: 'ENABLED' } });
  const role = await db.role.upsert({ where: { code: 'doctor' }, create: { code: 'doctor', title: 'Врач (тест)' }, update: {} });
  const doctor = await db.employee.create({ data: { fullName: 'Диалог QA — врач', roles: { create: { roleId: role.id } } } });
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
  await db.employeeShift.create({ data: { employeeId: doctor.id, startsAt: new Date(`${tomorrow}T07:00:00Z`), endsAt: new Date(`${tomorrow}T15:00:00Z`) } });
  const serviceIds = [];
  for (const title of ['Первичный приём', 'Повторный приём']) {
    const service = await db.service.create({ data: { title, isActive: true, publicOnWebsite: true } }); serviceIds.push(service.id);
    await db.assistantBookingRule.create({ data: { officeId: office.id, roomId: room.id, employeeId: doctor.id, serviceId: service.id, isActive: true, durationMinutes: 30, stepMinutes: 30, minimumLeadMinutes: 0, maximumDaysAhead: 7 } });
  }
  const task = await db.task.create({ data: { ownerId: owner.id, animalId: animal.id, taskType: 'revisit', title: 'INTERNAL_SYNTHETIC_TASK_TITLE', comment: 'INTERNAL_SYNTHETIC_TASK_COMMENT', dueAt: new Date(`${tomorrow}T21:00:00Z`) } });
  const payload = await new ClientPortalService(db, {}, {}).buildOwnerGatewaySnapshot(owner.id);
  await gateway.ownerSnapshot.create({ data: { ownerId: owner.id, displayName: owner.fullName, payload: JSON.parse(JSON.stringify(payload)), sourceVersion: 'synthetic-dialog-browser', sourceUpdatedAt: new Date() } });
  const token = 'synthetic-portal-dialog-qa-only-20261008';
  await gateway.portalSession.upsert({ where: { tokenHash: hashToken(token) }, create: { ownerId: owner.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 6 * 3600000) }, update: { ownerId: owner.id, expiresAt: new Date(Date.now() + 6 * 3600000), revokedAt: null } });
  const result = { syntheticOnly: true, ownerId: owner.id, animalId: animal.id, serviceIds, tomorrow, revisitId: task.id, revisitDueAt: task.dueAt.toISOString(), portalToken: token };
  await writeFile('outputs/assistant-20261008/dialog-browser-fixture.json', JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify(result));
} finally { await db.$disconnect(); await gateway.$disconnect(); }
