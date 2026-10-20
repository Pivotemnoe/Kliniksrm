import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { validateLocalReference, inventoryStale } from '../scripts/avito/local-crm-reference.mjs';
import { localOnlineRequests, localRequestRouteAllowed } from '../scripts/avito/local-online-requests.mjs';
import { avitoFixture } from './helpers/avito-fixture.mjs';
const require = createRequire(import.meta.url);
const { AvitoService } = require('../apps/api/dist/modules/avito/avito.service.js');
const { Module } = require('@nestjs/common');
const { NestFactory, Reflector } = require('@nestjs/core');
const { PermissionsGuard } = require('../apps/api/dist/modules/auth/permissions.guard.js');
const pilot = JSON.parse(readFileSync('docs/plans/2026-10-19-avito-clinic-pilot.json', 'utf8'));

test('local reference snapshot rejects stale, incomplete, duplicate or unidentified CRM sources', () => {
  const now = new Date('2026-10-19T18:00:00Z');
  const source = { source: 'clinic-crm-postgres/Service+ClinicOffice', readOnly: true, capturedAt: now.toISOString(), services: [{ id: 's1', title: 'Консультация', priceType: 'FIXED', price: 700, minimumPrice: null, maximumPrice: null }], offices: [{ id: 'o1', name: 'Филиал', phone: null, address: null, timezone: 'Europe/Moscow', workingHours: {} }] };
  assert.equal(validateLocalReference(source, now).services.length, 1);
  for (const changed of [{ readOnly: false }, { source: 'synthetic-qa' }, { capturedAt: '2026-10-17T18:00:00Z' }, { capturedAt: 'invalid' }, { services: [] }, { services: [...source.services, ...source.services] }]) assert.throws(() => validateLocalReference({ ...source, ...changed }, now));
  assert.equal(localRequestRouteAllowed('POST', '/api/v1/online-requests/r1/claim'), true);
  assert.equal(inventoryStale({ capturedAt: new Date(Date.now() - 16 * 60000).toISOString() }), true);
  assert.equal(inventoryStale({ capturedAt: new Date().toISOString() }), false);
  for (const path of ['/api/v1/online-requests', '/api/v1/online-requests/r1/accept', '/api/v1/online-requests/sync-owner-cabinet', '/api/v1/online-requests/r1/conversation']) assert.equal(localRequestRouteAllowed('POST', path), false);
});

test('director simulator can opt into AI intent, but never saves inquiries or weakens medical and routing rules', async () => {
  let calls = 0;
  const model = { classify: async () => { calls++; return { action: 'PRICE', serviceQuery: 'исследование', knowledgeId: null }; } };
  const crm = { answer: async (_org, text) => text === 'Сколько стоит исследование' ? { text: 'Проверенная услуга — 700 ₽.', reason: 'CRM_PRICE', handoff: false } : null, clinicContact: async () => ({ phone: '+7 900 000-00-01' }) };
  const service = new AvitoService({}, {}, {}, {}, crm, model);
  service.integration = async () => ({ id: 'synthetic', settingsVersion: 1, settings: pilot.settings, installation: { organizationId: 'local' } });
  const at = '2026-10-19T09:00:00Z'; const listingId = '4961988266';
  let result = await service.simulate(listingId, 'В какую сумму обойдется исследование?', undefined, at);
  assert.equal(calls, 0); assert.equal(result.persisted, false);
  const options = { useAi: true, clientKey: randomUUID() };
  result = await service.simulate(listingId, 'В какую сумму обойдется исследование?', undefined, at, options);
  assert.equal(calls, 1); assert.equal(result.modelStatus, 'USED'); assert.match(result.decision.text, /700/); assert.equal(result.persisted, false);
  result = await service.simulate(listingId, 'Кошка не ест, что дать?', undefined, at, options);
  assert.equal(calls, 1); assert.equal(result.modelStatus, 'RULES_SUFFICIENT'); assert.equal(result.decision.reason, 'MEDICAL'); assert.equal(result.decision.needsAttention, true); assert.match(result.decision.text, /администратор|врач|специалист/i);
  result = await service.simulate('4962396005', 'Какая вакцина лучше подходит кошке?', undefined, at, options);
  assert.equal(calls, 1); assert.equal(result.decision.reason, 'MEDICAL');
  result = await service.simulate('4514134400', 'В какую сумму обойдется?', undefined, at, options);
  assert.equal(calls, 1); assert.equal(result.decision.reason, 'UNMAPPED_LISTING');
  await assert.rejects(() => service.simulate(listingId, 'Вопрос', undefined, at, { useAi: true }), /идентификатор/);
  model.classify = async () => null;
  result = await service.simulate(listingId, 'В какую сумму обойдется?', undefined, at, options);
  assert.equal(result.modelStatus, 'UNAVAILABLE'); assert.equal(result.decision.handoff, true);
});

test('a vaccine stock change cancels an old answer; CRM balances are trusted regardless of expiry fields and other offices stay separate', { skip: !process.env.AVITO_QA_DATABASE_URL }, async () => {
  const f = await avitoFixture(); const ids = []; const warehouses = []; const products = []; let category;
  try {
    for (const name of ['Проверяемый филиал', 'Другой филиал']) {
      const office = await f.prisma.clinicOffice.create({ data: { organizationId: 'avito-qa-org', name, phone: '+7 900 000-00-01' } }); ids.push(office.id);
      const warehouse = await f.prisma.warehouse.create({ data: { officeId: office.id, name: 'Тестовый склад' } }); warehouses.push(warehouse.id);
    }
    category = await f.prisma.productCategory.create({ data: { title: 'Вакцины' } });
    for (const [i, title] of ['Альфа', 'Бета', 'Гамма', 'Дельта'].entries()) {
      const product = await f.prisma.product.create({ data: { title: `Тестовая вакцина ${title}`, categoryId: category.id } }); products.push(product.id);
      await f.prisma.stockBatch.create({ data: { productId: product.id, warehouseId: warehouses[i === 3 ? 1 : 0], quantity: 1, rest: 1, expiresAt: i === 1 ? new Date('2000-01-01') : i === 2 ? null : new Date('2099-01-01') } });
    }
    const integration = await f.service.integration();
    await f.service.updateSettings({ version: integration.settingsVersion, settings: { ...integration.settings, administratorSchedule: { ...integration.settings.administratorSchedule, officeId: ids[0] } } }, f.actorId);
    const chatId = `clinic-stock-${randomUUID()}`; f.api.add(chatId, 'stock-question', 'Какие вакцины есть?'); await f.service.syncChat(chatId);
    const c = await f.service.getConversation((await f.prisma.avitoConversation.findUniqueOrThrow({ where: { integrationId_externalChatId: { integrationId: f.integration.id, externalChatId: chatId } } })).id);
    const draft = c.outbox.find(o => o.status === 'DRAFT'); assert.ok(draft); assert.equal(draft.purpose, 'CRM_REPLY');
    assert.match(draft.text, /Альфа/); assert.match(draft.text, /Бета/); assert.match(draft.text, /Гамма/); assert.ok(!/Дельта|срок|годност/.test(draft.text));
    const op = await f.service.reply(c.id, { clientKey: randomUUID(), text: draft.text, draftId: draft.id, version: c.version }, f.actorId);
    await f.prisma.stockBatch.updateMany({ where: { productId: products[0] }, data: { rest: 0 } }); await f.service.deliver(op.operationId);
    assert.equal((await f.prisma.avitoOutgoingOperation.findUniqueOrThrow({ where: { id: op.operationId } })).status, 'CANCELLED'); assert.equal(f.api.sent.length, 0);
  } finally {
    await f.prisma.stockBatch.deleteMany({ where: { productId: { in: products } } }); await f.prisma.product.deleteMany({ where: { id: { in: products } } });
    if (category) await f.prisma.productCategory.delete({ where: { id: category.id } });
    await f.prisma.warehouse.deleteMany({ where: { id: { in: warehouses } } }); await f.prisma.clinicOffice.deleteMany({ where: { id: { in: ids } } }); await f.prisma.$disconnect();
  }
});

test('a synthetic Avito callback reaches the real CRM request queue and can be claimed only by staff', { skip: !process.env.AVITO_QA_DATABASE_URL }, async () => {
  const f = await avitoFixture();
  const chatId = `clinic-local-handoff-${randomUUID()}`;
  const adminId = `avito-local-qa-admin-${randomUUID()}`;
  let app;
  try {
    await f.prisma.employee.create({ data: { id: adminId, fullName: 'Тестовый администратор', status: 'ACTIVE' } });
    f.api.add(chatId, 'callback', 'Хочу записаться, меня зовут Тестовый Владелец, +7 900 000-00-00');
    await f.service.syncChat(chatId);
    const conversation = await f.prisma.avitoConversation.findUniqueOrThrow({ where: { integrationId_externalChatId: { integrationId: f.integration.id, externalChatId: chatId } } });
    assert.ok(conversation.requestId); assert.equal(conversation.mode, 'HUMAN'); assert.equal(f.api.sent.length, 0);
    const requests = localOnlineRequests(f.prisma, f.audit);
    class LocalQueueQa {}
    Module({ controllers: [requests.controller], providers: requests.providers })(LocalQueueQa);
    app = await NestFactory.create(LocalQueueQa, { logger: false }); app.setGlobalPrefix('api');
    app.use((req, res, next) => {
      const role = req.headers['x-local-test-role'] || 'administrator';
      req.auth = { employee: { id: role === 'director' ? f.actorId : adminId, roles: [role], permissions: ['appointments.read', 'appointments.manage'] } };
      if (!localRequestRouteAllowed(req.method, req.path)) return res.status(403).end();
      next();
    });
    app.useGlobalGuards(new PermissionsGuard(new Reflector()));
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}/api/v1/online-requests`;
    const queue = await (await fetch(base)).json(); assert.ok(queue.items.some(r => r.id === conversation.requestId && r.source === 'AVITO'));
    const request = await (await fetch(`${base}/${conversation.requestId}`)).json(); assert.equal(request.appointmentId, null); assert.equal(request.preferredAt, null); assert.match(request.comment, /Источник: Авито/);
    assert.equal((await fetch(base, { headers: { 'x-local-test-role': 'doctor' } })).status, 403);
    const claimed = await (await fetch(`${base}/${conversation.requestId}/claim`, { method: 'POST' })).json();
    assert.equal(claimed.status, 'IN_REVIEW'); assert.equal(claimed.assignedEmployeeId, adminId);
    const attention = await (await fetch(`${base}/attention`)).json(); assert.ok(!attention.items.some(r => r.id === conversation.requestId));
    assert.equal((await fetch(`${base}/${conversation.requestId}/accept`, { method: 'POST' })).status, 403);
    assert.equal(f.api.sent.length, 0);
  } finally {
    if (app) { app.getHttpServer().closeAllConnections?.(); await app.close(); }
    await f.prisma.onlineAppointmentRequest.updateMany({ where: { assignedEmployeeId: adminId }, data: { assignedEmployeeId: null } });
    await f.prisma.employee.delete({ where: { id: adminId } }); await f.prisma.$disconnect();
  }
});
