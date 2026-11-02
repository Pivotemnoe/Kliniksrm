import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { avitoFixture } from './helpers/avito-fixture.mjs';
const require = createRequire(import.meta.url);
const { StaffAlertsService } = require('../apps/api/dist/modules/staff-alerts/staff-alerts.service.js');
const { avitoMessageAlerts } = require('../apps/api/dist/modules/staff-alerts/avito-message-alerts.js');

const actor = (id, roles = ['administrator'], permissions = ['avito.read']) => ({ id, roles, permissions });

test('Avito alerts require the same role and permission as the conversation, without querying private data', async () => {
  const unavailable = new Proxy({}, { get() { throw Error('Unauthorized database read'); } });
  for (const employee of [actor('one', ['doctor'], ['*']), actor('one', ['groomer']), actor('one', ['administrator'], []), actor('one', [], ['avito.read'])]) {
    assert.deepEqual(await avitoMessageAlerts(unavailable, employee), []);
  }
});

test('local inbox alerts survive bot replies, acknowledge per employee and reappear for each new message', async () => {
  const f = await avitoFixture(), { prisma: db } = f;
  const suffix = randomUUID(), director = actor(f.actorId, ['director']);
  const adminId = `alert-admin-${suffix}`;
  await db.employee.create({ data: { id: adminId, fullName: 'Синтетический администратор' } });
  const admin = actor(adminId), alerts = new StaffAlertsService(db, f.audit);
  const since = new Date(Date.now() - 120000), at = new Date(Date.now() - 60000);
  await db.clinicModuleInstallation.update({ where: { id: f.integration.installationId }, data: { enabled: true, enabledAt: since } });
  const create = (name, direction, messages) => db.avitoConversation.create({ data: {
    integrationId: f.integration.id, externalChatId: `alert-${name}-${suffix}`, listingId: '202', listingTitle: 'Груминг', customerName: 'Синтетический клиент',
    direction, contact: {}, lastMessageAt: at, messages: { create: messages },
  } });
  const message = (id, data = {}) => ({ externalId: `${id}-${suffix}`, direction: 'IN', authorId: 'synthetic-customer', type: 'text', text: 'Сколько стоит стрижка?', occurredAt: at, ...data });
  const conversation = await create('active', 'GROOMING', [message('initial')]);
  const attachment = await create('attachment', 'UNASSIGNED', [message('photo', { type: 'image', text: '' })]);
  const excluded = await Promise.all([
    create('archive', 'CLINIC', [message('archive', { occurredAt: new Date(since.getTime() - 1) })]),
    create('system', 'CLINIC', [message('system', { type: 'system' })]),
    create('outgoing', 'CLINIC', [message('out', { direction: 'OUT' })]),
  ]);
  const avito = async who => (await alerts.list(who)).items.filter(i => i.kind === 'AVITO_MESSAGE' && [conversation.id, attachment.id].some(id => i.key === `avito:${id}`));
  const current = async who => (await avito(who)).find(i => i.key === `avito:${conversation.id}`);
  try {
    const initial = await avito(director);
    assert.equal(initial.length, 2);
    assert.ok((await avitoMessageAlerts(db, director)).every(i => !excluded.some(c => i.key === `avito:${c.id}`)));
    assert.ok(initial.every(item => item.unread));
    assert.match(initial.find(i => i.key.endsWith(attachment.id)).description, /Вложение|Фотография/);
    const first = await current(director);
    assert.equal(first.href, `/avito?tab=inbox&direction=GROOMING&conversation=${conversation.id}`);
    await alerts.markRead(first.key, director, first.version);
    assert.equal((await current(director)).unread, false);
    assert.equal((await current(admin)).unread, true);
    // A staff/bot response and a contact/version update are not a new customer message.
    await db.avitoMessage.create({ data: { conversationId: conversation.id, ...message('reply', { direction: 'OUT', occurredAt: new Date(at.getTime() + 5000) }) } });
    await db.avitoConversation.update({ where: { id: conversation.id }, data: { version: { increment: 1 }, needsAttention: true, mode: 'HUMAN' } });
    assert.equal((await current(director)).unread, false);
    assert.equal((await current(director)).severity, 'warning');
    const next = await db.avitoMessage.create({ data: { conversationId: conversation.id, ...message('next', { text: 'И когда можно приехать?', occurredAt: new Date(at.getTime() + 10000) }) } });
    assert.equal((await current(director)).version, next.id);
    assert.equal((await current(director)).unread, true);
    await assert.rejects(alerts.markRead(first.key, director, first.version), e => e.getStatus() === 409);
    await assert.rejects(alerts.markRead(first.key, director), e => e.getStatus() === 409);
    assert.equal((await current(director)).unread, true);
    await alerts.markRead(first.key, director, next.id);
    assert.equal((await current(director)).unread, false);
    assert.equal((await current(admin)).unread, true);
    // Avito timestamps have second resolution. An incoming message in a later
    // sync at the same second must still renew the alert, regardless of UUID.
    const sameSecond = await db.avitoMessage.create({ data: { id: `0-${suffix}`, conversationId: conversation.id,
      ...message('same-second', { occurredAt: next.occurredAt, createdAt: new Date(next.createdAt.getTime() + 1) }) } });
    assert.equal((await current(director)).version, sameSecond.id);
    assert.equal((await current(director)).unread, true);
    assert.deepEqual(await avitoMessageAlerts(db, actor(adminId, ['doctor'], ['avito.read'])), []);
    await alerts.markAllRead(admin);
    assert.ok((await avito(admin)).every(i => !i.unread));
    await db.avitoMessage.create({ data: { conversationId: conversation.id, ...message('new-again', { occurredAt: new Date(at.getTime() + 20000) }) } });
    assert.equal((await current(admin)).unread, true);
    await db.clinicModuleInstallation.update({ where: { id: f.integration.installationId }, data: { enabled: false } });
    assert.deepEqual(await avitoMessageAlerts(db, director), []);
    await assert.rejects(alerts.markRead(first.key, director, next.id), e => e.getStatus() === 404);
    assert.equal(f.api.sent.length, 0);
    assert.equal(await db.avitoInquiry.count({ where: { conversationId: conversation.id } }), 0);
  } finally {
    await db.$disconnect();
  }
});
