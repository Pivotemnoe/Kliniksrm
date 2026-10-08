import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { OnlineRequestAttentionService } from '../apps/api/dist/modules/online-requests/online-request-attention.service.js';
import { OnlineRequestsService } from '../apps/api/dist/modules/online-requests/online-requests.service.js';

const url = process.env.ASSISTANT_TEST_DATABASE_URL;
test('request attention persists and arbitrates two administrators in PostgreSQL', { skip: !url }, async t => {
  const parsed = new URL(url);
  assert.ok(['localhost', '127.0.0.1'].includes(parsed.hostname) && parsed.pathname === '/crm_assistant_qa' && parsed.port === '15488', 'Only isolated crm_assistant_qa on15488 is allowed');
  const db = new PrismaClient({ datasources: { db: { url } } });
  const first = await db.employee.create({ data: { fullName: 'Тестовый администратор 1' } });
  const second = await db.employee.create({ data: { fullName: 'Тестовый администратор 2' } });
  const createdIds = [];
  // Other suites keep their evidence in the same throwaway database. Hide that
  // backlog only for these two new fixture employees, rather than deleting it.
  const existing = await db.onlineAppointmentRequest.findMany({ where: { OR: [{ status: { in: ['NEW', 'IN_REVIEW'] } }, { conversationNeedsAttention: true }] }, select: { id: true } });
  if (existing.length) await db.onlineRequestSnooze.createMany({ data: existing.flatMap(row => [first, second].map(employee => ({ requestId: row.id, employeeId: employee.id, until: new Date(Date.now() + 3600_000) }))) });
  t.after(async () => {
    await db.onlineAppointmentRequest.updateMany({ where: { id: { in: createdIds } }, data: { status: 'ARCHIVED', conversationNeedsAttention: false } });
    await db.onlineRequestSnooze.deleteMany({ where: { employeeId: { in: [first.id, second.id] } } });
    await db.$disconnect();
  });
  const attention = new OnlineRequestAttentionService(db);
  const requests = new OnlineRequestsService(db, { log: async () => {} }, {}, {});
  const make = async () => { const item = await db.onlineAppointmentRequest.create({ data: { ownerName: 'Вымышленный владелец', phone: '+79990000001', animalNickname: 'Тестовый питомец', source: 'SITE_CHAT' } }); createdIds.push(item.id); return item; };
  await t.test('both staff see an unclaimed request; one snooze does not hide it from the other', async () => {
    const item = await make();
    assert.ok((await attention.list(first.id)).items.some(x => x.id === item.id));
    await attention.snooze(item.id, first.id);
    assert.ok(!(await new OnlineRequestAttentionService(db).list(first.id)).items.some(x => x.id === item.id));
    assert.ok((await attention.list(second.id)).items.some(x => x.id === item.id));
    await db.onlineRequestSnooze.update({ where: { requestId_employeeId: { requestId: item.id, employeeId: first.id } }, data: { until: new Date(Date.now() - 1000) } });
    assert.ok((await attention.list(first.id)).items.some(x => x.id === item.id));
    await db.onlineAppointmentRequest.update({ where: { id: item.id }, data: { status: 'ARCHIVED' } });
  });
  await t.test('simultaneous claims have one winner, audited once, retry is idempotent', async () => {
    const item = await make();
    const results = await Promise.allSettled([attention.claim(item.id, first.id), attention.claim(item.id, second.id)]);
    assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
    const saved = await db.onlineAppointmentRequest.findUniqueOrThrow({ where: { id: item.id } });
    assert.equal(saved.status, 'IN_REVIEW');
    assert.ok(saved.claimedAt);
    await attention.claim(item.id, saved.assignedEmployeeId);
    assert.equal(await db.auditLog.count({ where: { entityId: item.id, action: 'online_request.claim' } }), 1);
    assert.ok(!(await attention.list(second.id)).items.some(x => x.id === item.id));
    const loser = saved.assignedEmployeeId === first.id ? second.id : first.id;
    await assert.rejects(requests.updateRequest(item.id, { comment: 'не должно измениться' }, loser), /другой сотрудник/);
    await assert.rejects(requests.setRequestStatus(item.id, 'ARCHIVED', loser), /другой сотрудник/);
    await requests.setRequestStatus(item.id, 'ARCHIVED', saved.assignedEmployeeId);
    await assert.rejects(attention.claim(item.id, first.id), /обработана/);
  });
  await t.test('unresolved claim reappears after five minutes; blocked assignee can be replaced', async () => {
    const item = await make();
    await attention.claim(item.id, first.id);
    await db.onlineAppointmentRequest.update({ where: { id: item.id }, data: { claimedAt: new Date(Date.now() - 6 * 60_000) } });
    assert.ok((await attention.list(second.id)).items.some(x => x.id === item.id));
    await assert.rejects(attention.claim(item.id, second.id), /уже обрабатывает/);
    await db.employee.update({ where: { id: first.id }, data: { status: 'BLOCKED' } });
    assert.equal((await attention.claim(item.id, second.id)).assignedEmployeeId, second.id);
    await requests.setRequestStatus(item.id, 'CANCELLED', second.id);
  });
  await t.test('marking read does not hide a request; closing it does', async () => {
    const item = await make();
    await db.staffAlertRead.create({ data: { employeeId: second.id, alertKey: 'online-requests', version: 'read' } });
    assert.ok((await attention.list(second.id)).items.some(x => x.id === item.id));
    await requests.setRequestStatus(item.id, 'CANCELLED', second.id);
    assert.ok(!(await attention.list(second.id)).items.some(x => x.id === item.id));
    await assert.rejects(attention.snooze(item.id, second.id), /обработана/);
    await assert.rejects(attention.claim('missing-request', second.id), /не найдена/);
  });
  await t.test('backlog over thirty preserves total and reveals later requests after earlier ones are processed', async () => {
    const items = [];
    for (let i = 0; i < 35; i++) items.push(await make());
    const firstPage = await attention.list(second.id);
    assert.equal(firstPage.items.length, 30); assert.equal(firstPage.total, 35);
    assert.ok(!firstPage.items.some(x => x.id === items.at(-1).id));
    await db.onlineAppointmentRequest.updateMany({ where: { id: { in: firstPage.items.map(x => x.id) } }, data: { status: 'ARCHIVED' } });
    const next = await attention.list(second.id); assert.equal(next.total, 5);
    assert.ok(next.items.some(x => x.id === items.at(-1).id));
  });
});
