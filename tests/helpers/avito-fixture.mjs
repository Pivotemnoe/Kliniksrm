import 'reflect-metadata';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const { AvitoService } = require('../../apps/api/dist/modules/avito/avito.service.js');
const { ClinicModulesService } = require('../../apps/api/dist/modules/clinic-modules/clinic-modules.service.js');
const { AuditService } = require('../../apps/api/dist/modules/audit/audit.service.js');
const { defaultAvitoSettings } = require('../../apps/api/dist/modules/avito/avito.settings.js');
const { AvitoCrmKnowledgeService } = require('../../apps/api/dist/modules/avito/avito-crm-knowledge.service.js');
const { AvitoModelGatewayClient } = require('../../apps/api/dist/modules/avito/avito-model-gateway.client.js');
const { AvitoEditorService } = require('../../apps/api/dist/modules/avito/avito-editor.service.js');

export class FakeAvitoApi {
  accountId = 900001; sent = []; histories = new Map(); failSend = false; failRead = false; enabled = true;
  configured() { return true; } liveSendEnabled() { return this.enabled; } ingestionEnabled() { return true; }
  async self() { return { id: this.accountId, name: 'Тестовый аккаунт Авито' }; }
  listingId(chatId) { return chatId.startsWith('groom') ? 202 : chatId.startsWith('hotel') ? 303 : chatId.startsWith('unknown') ? 999 : 101; }
  async chat(_account, chatId) { return { id: chatId, users: [{ id: 900002, name: 'Тестовый клиент' }], context: { type: 'item', value: { id: this.listingId(chatId), title: { 101: 'Приём в клинике', 202: 'Груминг', 303: 'Зоогостиница' }[this.listingId(chatId)] ?? 'Неизвестное объявление' } } }; }
  async chats(_account, offset = 0) { return Promise.all([...this.histories.keys()].slice(offset, offset + 20).map(id => this.chat(_account, id))); }
  add(chatId, id, text, extra = {}) { const message = { id, author_id: 900002, direction: 'in', type: 'text', created: Math.floor(Date.now() / 1000) + this.histories.size + (this.histories.get(chatId)?.length ?? 0), content: { text }, ...extra }; this.histories.set(chatId, [message, ...(this.histories.get(chatId) ?? [])]); return message; }
  async messages(_account, chatId, offset = 0) { if (this.failRead) throw Error('synthetic read failure'); return (this.histories.get(chatId) ?? []).slice(offset, offset + 100); }
  async send(accountId, chatId, text) { const id = `out-${this.sent.length + 1}`; this.sent.push({ id, chatId, text }); this.add(chatId, id, text, { author_id: this.accountId, direction: 'out' }); if (this.failSend) throw Error('synthetic lost response'); return { id }; }
  async ownListings() { return { items: [101, 202, 303].map(id => ({ id: String(id), title: String(id), status: 'active', url: null })), nextPage: null }; }
  async publishingAccess(accountId) { return { accountId, checkedAt: new Date().toISOString(), mode: 'READ_ONLY', synthetic: true, profileHttpStatus: 403, fieldsHttpStatus: 200, category: 'Уход за животными', schemaFields: ['Id','Title','Description','AvitoId','Images'], livePublishingEnabled: false, writeTested: false, operations: ['publication','editing','photos'].map(key => ({ key, schemaSupported: true, access: 'BLOCKED', note: 'Локальный стенд: синтетический ответ HTTP 403. Реальные ключи здесь не используются.' })) }; }
}
export async function avitoFixture() {
  const url = process.env.AVITO_QA_DATABASE_URL;
  if (!url || !/^postgresql:\/\/[^@]+@127\.0\.0\.1:55439\/avito_merge_qa_20261020(?:\?|$)/.test(url)) throw Error('Avito fixture requires the isolated avito_merge_qa_20261020 database on 127.0.0.1:55439');
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  await prisma.organization.upsert({ where: { id: 'avito-qa-org' }, update: {}, create: { id: 'avito-qa-org', displayName: 'Тестовая клиника', createdAt: new Date('2020-01-01') } });
  await prisma.employee.upsert({ where: { id: 'avito-qa-director' }, update: {}, create: { id: 'avito-qa-director', fullName: 'Тестовый директор', status: 'ACTIVE' } });
  const audit = new AuditService(prisma); const license = { enforcementActive: false, status: 'COMPATIBILITY', features: [] };
  const modules = new ClinicModulesService(prisma, audit, { getLicenseState: async () => license });
  const api = new FakeAvitoApi(); const crm = new AvitoCrmKnowledgeService(prisma); const model = new AvitoModelGatewayClient(); const service = new AvitoService(prisma, modules, api, audit, crm, model);
  const editor = new AvitoEditorService(prisma, service, api, audit, model);
  service.now = () => new Date('2026-10-19T09:00:00Z');
  const i = await service.integration();
  const s = defaultAvitoSettings(); s.mode = 'SUGGEST';
  s.listings = ['CLINIC', 'GROOMING', 'HOTEL'].map((direction, n) => ({ id: String([101, 202, 303][n]), title: ['Приём в клинике', 'Груминг', 'Зоогостиница'][n], direction, enabled: true }));
  s.profiles.forEach(p => { p.enabled = true; p.knowledge = [{ id: 'location', title: 'Адрес', keywords: ['адрес'], answer: `Тестовый адрес направления ${p.title}` }]; });
  const updated = await prisma.avitoIntegration.update({ where: { id: i.id }, data: { accountId: String(api.accountId), accountName: 'Тестовый аккаунт Авито', connectionError: null, settings: s, settingsVersion: { increment: 1 } } });
  await prisma.clinicModuleInstallation.update({ where: { id: i.installationId }, data: { enabled: true, enabledAt: new Date(Date.now() - 120000) } });
  return { prisma, audit, modules, api, crm, model, service, editor, license, settings: s, integration: updated, actorId: 'avito-qa-director' };
}
