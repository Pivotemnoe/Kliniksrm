import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { avitoFixture } from './helpers/avito-fixture.mjs';
const require = createRequire(import.meta.url);
const { ClinicModulesController } = require('../apps/api/dist/modules/clinic-modules/clinic-modules.controller.js');

test('module permissions cannot be substituted by permissions for another module', () => {
  const calls = [];
  const controller = new ClinicModulesController({ setEnabled: (...args) => calls.push(args) });
  const body = { enabled: true, version: 0 };
  assert.throws(() => controller.update('avito-administrator', body, { id: 'director', permissions: ['modules.manage'] }), /Нет права/);
  assert.throws(() => controller.update('GROOMING', body, { id: 'director', permissions: ['avito.manage'] }), /Нет права/);
  controller.update('avito-administrator', body, { id: 'director', permissions: ['avito.manage'] });
  controller.update('GROOMING', body, { id: 'director', permissions: ['modules.manage'] });
  assert.deepEqual(calls.map(args => args[0]), ['avito-administrator', 'GROOMING']);
});

test('Avito and grooming have independent installations, switches, settings and pending operations', { skip: !process.env.AVITO_QA_DATABASE_URL }, async () => {
  const f = await avitoFixture();
  try {
    const grooming = await f.modules.installation('GROOMING');
    assert.notEqual(grooming.id, f.integration.installationId);
    const enabled = await f.modules.setEnabled('GROOMING', true, grooming.version, f.actorId);
    const settings = await f.prisma.groomingSettings.upsert({ where: { installationId: grooming.id }, create: { installationId: grooming.id, selfBookingEnabled: false }, update: {} });
    const chat = 'module-isolation-' + randomUUID();
    f.api.add(chat, 'isolated-question', 'Здравствуйте');
    await f.service.syncChat(chat);
    const conversation = await f.prisma.avitoConversation.findUniqueOrThrow({ where: { integrationId_externalChatId: { integrationId: f.integration.id, externalChatId: chat } } });
    const pending = await f.prisma.avitoOutgoingOperation.findFirstOrThrow({ where: { conversationId: conversation.id, status: 'DRAFT' } });
    const disabled = await f.modules.setEnabled('GROOMING', false, enabled.version, f.actorId);
    assert.equal((await f.service.integration()).installation.moduleKey, 'avito-administrator');
    assert.equal((await f.service.integration()).installation.enabled, true);
    assert.equal((await f.prisma.avitoOutgoingOperation.findUniqueOrThrow({ where: { id: pending.id } })).status, 'DRAFT');
    const avito = await f.modules.installation('avito-administrator');
    await f.modules.setEnabled('avito-administrator', false, avito.version, f.actorId);
    assert.equal((await f.prisma.avitoOutgoingOperation.findUniqueOrThrow({ where: { id: pending.id } })).status, 'CANCELLED');
    assert.deepEqual(await f.modules.installation('GROOMING'), disabled);
    assert.deepEqual(await f.prisma.groomingSettings.findUniqueOrThrow({ where: { installationId: grooming.id } }), settings);
    const availability = await f.modules.availability();
    assert.deepEqual(new Set(availability.map(item => item.key)), new Set(['GROOMING', 'PET_HOTEL', 'avito-administrator']));
    assert.equal(f.api.sent.length, 0);
  } finally { await f.prisma.$disconnect(); }
});
