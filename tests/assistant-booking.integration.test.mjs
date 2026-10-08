import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { AppointmentsService } from '../apps/api/dist/modules/appointments/appointments.service.js';
import { AuditService } from '../apps/api/dist/modules/audit/audit.service.js';
import { SchedulingService } from '../apps/api/dist/modules/scheduling/scheduling.service.js';
import { OnlineRequestsService } from '../apps/api/dist/modules/online-requests/online-requests.service.js';
import { OnlineRequestAttentionService } from '../apps/api/dist/modules/online-requests/online-request-attention.service.js';
import { ClinicConversationSyncService } from '../apps/api/dist/modules/online-requests/clinic-conversation-sync.service.js';
const url = process.env.ASSISTANT_TEST_DATABASE_URL;
test('isolated PostgreSQL: booking retries, competing slots, rollback and handoff', { skip: !url }, async t => {
  const parsed = new URL(url);
  assert.ok(parsed.hostname === '127.0.0.1' && parsed.port === '15488' && parsed.pathname === '/crm_assistant_qa');
  const db = new PrismaClient({ datasources: { db: { url } } });
  const audit = new AuditService(db); const scheduling = new SchedulingService(db, audit);
  const appointments = new AppointmentsService(db, audit, scheduling);
  const requests = new OnlineRequestsService(db, audit, scheduling, appointments, new ClinicConversationSyncService(db));
  const attention = new OnlineRequestAttentionService(db);
  const org = await db.organization.create({ data: { displayName: 'QA clinic' } });
  const office = await db.clinicOffice.create({ data: { organizationId: org.id, name: 'QA office' } });
  const room = await db.room.create({ data: { officeId: office.id, name: 'QA room' } });
  const owner = await db.owner.create({ data: { fullName: 'QA owner' } });
  const animal = await db.animal.create({ data: { ownerId: owner.id, nickname: 'QA cat' } });
  const staff = await db.employee.create({ data: { fullName: 'QA staff' } });
  const second = await db.employee.create({ data: { fullName: 'QA second' } });
  const createdIds = [];
  const previous = await db.onlineAppointmentRequest.findMany({ where: { OR: [{ status: { in: ['NEW', 'IN_REVIEW'] } }, { conversationNeedsAttention: true }] }, select: { id: true } });
  if (previous.length) await db.onlineRequestSnooze.createMany({ data: previous.flatMap(row => [staff, second].map(employee => ({ requestId: row.id, employeeId: employee.id, until: new Date(Date.now() + 3600_000) }))) });
  t.after(async () => {
    await db.onlineAppointmentRequest.updateMany({ where: { id: { in: createdIds }, status: { in: ['NEW', 'IN_REVIEW'] } }, data: { status: 'ARCHIVED', conversationNeedsAttention: false } });
    await db.onlineRequestSnooze.deleteMany({ where: { employeeId: { in: [staff.id, second.id] } } });
    await db.$disconnect();
  });
  const input = { ownerId: owner.id, animalId: animal.id, officeId: office.id, employeeId: staff.id, roomId: room.id, startsAt: '2099-10-08T10:00:00Z' };
  const make = async () => { const item = await db.onlineAppointmentRequest.create({ data: { ownerName: 'QA owner', phone: '+79990000001', animalNickname: 'QA cat' } }); createdIds.push(item.id); return item; };
  await t.test('same request confirmed simultaneously creates exactly one appointment', async () => {
    const request = await make();
    const [a, b] = await Promise.all([requests.acceptRequest(request.id, input, staff.id), requests.acceptRequest(request.id, input, staff.id)]);
    assert.equal(a.appointmentId, b.appointmentId);
    assert.equal(await db.auditLog.count({ where: { entityId: request.id, action: 'online_request.accept' } }), 1);
    assert.equal(await db.appointment.count({ where: { ownerId: owner.id } }), 1);
  });
  await t.test('competing manual bookings for a room have one winner even with different doctors', async () => {
    const time = '2099-10-08T12:00:00Z';
    const result = await Promise.allSettled([
      appointments.createAppointment({ ...input, startsAt: time }, staff.id),
      appointments.createAppointment({ ...input, employeeId: second.id, startsAt: time }, second.id),
    ]);
    assert.equal(result.filter(x => x.status === 'fulfilled').length, 1);
    assert.match(result.find(x => x.status === 'rejected').reason.message, /уже занят/);
  });
  await t.test('failed slot confirmation leaves the request and schedule unchanged', async () => {
    const request = await make();
    const count = await db.appointment.count();
    await assert.rejects(requests.acceptRequest(request.id, input, staff.id), /уже занят/);
    assert.equal(await db.appointment.count(), count);
    assert.equal((await db.onlineAppointmentRequest.findUniqueOrThrow({ where: { id: request.id } })).status, 'NEW');
    await requests.setRequestStatus(request.id, 'ARCHIVED', staff.id);
  });
  await t.test('handoff returns a durable unclaimed request; other staff can claim it', async () => {
    const request = await make(); await attention.claim(request.id, staff.id); await attention.snooze(request.id, second.id);
    await assert.rejects(attention.release(request.id, second.id), /ответственный/);
    await attention.release(request.id, staff.id);
    assert.ok((await attention.list(second.id)).items.some(x => x.id === request.id));
    assert.equal((await attention.claim(request.id, second.id)).assignedEmployeeId, second.id);
    await requests.setRequestStatus(request.id, 'ARCHIVED', second.id);
  });
  await t.test('chat confirmation is queued once with the actual appointment time; rejected slot queues nothing', async () => {
    const request = await make();
    await db.onlineAppointmentRequest.update({ where: { id: request.id }, data: { conversationId: `qa_${request.id}` } });
    const confirmed = await requests.acceptRequest(request.id, { ...input, startsAt: '2099-10-08T14:00:00Z' }, staff.id);
    await requests.acceptRequest(request.id, { ...input, startsAt: '2099-10-08T16:00:00Z' }, staff.id);
    const jobs = await db.backgroundJob.findMany({ where: { queueName: 'clinic-conversation', payload: { path: ['requestId'], equals: request.id } } });
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].payload.appointmentId, confirmed.appointmentId);
    assert.match(jobs[0].payload.text, /17:00/);
    // This test has no gateway conversation; don't leave an unrelated dispatch in the shared QA queue.
    await db.backgroundJob.update({ where: { id: jobs[0].id }, data: { status: 'DONE' } });
    const failed = await make();
    await db.onlineAppointmentRequest.update({ where: { id: failed.id }, data: { conversationId: `qa_${failed.id}` } });
    await assert.rejects(requests.acceptRequest(failed.id, input, staff.id), /уже занят/);
    assert.equal(await db.backgroundJob.count({ where: { queueName: 'clinic-conversation', payload: { path: ['requestId'], equals: failed.id } } }), 0);
    await requests.setRequestStatus(failed.id, 'ARCHIVED', staff.id);
  });
  await t.test('schedule transactions do not exhaust a small connection pool under concurrent bookings', async () => {
    const limited = new PrismaClient({ datasources: { db: { url: `${url}?connection_limit=2&pool_timeout=1` } } });
    try {
      const localAudit = new AuditService(limited);
      const localAppointments = new AppointmentsService(limited, localAudit, new SchedulingService(limited, localAudit));
      const results = await Promise.allSettled([18, 19, 20, 21].map(hour => localAppointments.createAppointment({ ...input, startsAt: `2099-10-08T${hour}:00:00Z` }, staff.id)));
      assert.equal(results.filter(x => x.status === 'fulfilled').length, 4, results.filter(x => x.status === 'rejected').map(x => x.reason.message).join('\n'));
    } finally { await limited.$disconnect(); }
  });
});
