import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { avitoFixture } from './helpers/avito-fixture.mjs';

const enabled = Boolean(process.env.AVITO_QA_DATABASE_URL);
test('Avito durable processing against isolated PostgreSQL', { skip: !enabled }, async t => {
  const f = await avitoFixture(); const { prisma, api, service, modules, actorId, license } = f;
  const run = randomUUID().slice(0, 8);
  const chat = name => `${name}-${run}`;
  const load = async id => { await service.syncChat(id); return service.getConversation((await prisma.avitoConversation.findUniqueOrThrow({ where: { integrationId_externalChatId: { integrationId: f.integration.id, externalChatId: id } } })).id); };
  const approve = async c => {
    const draft = c.outbox.find(o => o.status === 'DRAFT'); assert.ok(draft);
    const op = await service.reply(c.id, { clientKey: randomUUID(), text: draft.text, draftId: draft.id, version: c.version }, actorId);
    await service.deliver(op.operationId); return op.operationId;
  };
  try {
    await t.test('a restricted pilot imports other chats without model calls, inquiries or outgoing messages', async () => {
      const previous = process.env.AVITO_PILOT_CHAT_IDS;
      const configured = f.model.configured; const classify = f.model.classify;
      let modelCalls = 0;
      const allowed = chat('clinic-pilot-allowed');
      const blocked = chat('clinic-pilot-blocked');
      process.env.AVITO_PILOT_CHAT_IDS = allowed;
      f.model.configured = () => true;
      f.model.classify = async () => { modelCalls++; return null; };
      try {
        api.add(blocked, 'blocked-callback', 'Хочу записаться, меня зовут Анна, +7 900 111-22-33');
        const c = await load(blocked);
        assert.equal(c.messages.length, 1);
        assert.equal(c.outbox.length, 0);
        assert.equal(c.inquiries.length, 0);
        assert.equal(c.requestId, null);
        assert.equal(modelCalls, 0);
        await assert.rejects(() => service.reply(c.id, { clientKey: randomUUID(), version: c.version, text: 'synthetic' }, actorId), /контрольным диалогом/);
        api.add(allowed, 'allowed-greeting', 'Здравствуйте');
        const permitted = await load(allowed);
        assert.equal(permitted.outbox.filter(op => op.status === 'DRAFT').length, 1);
      } finally {
        f.model.configured = configured; f.model.classify = classify;
        if (previous === undefined) delete process.env.AVITO_PILOT_CHAT_IDS; else process.env.AVITO_PILOT_CHAT_IDS = previous;
      }
    });
    await t.test('unmapped ads remain in the manual inbox, without a default clinic reply', async () => {
      const id = chat('unknown'); api.add(id, 'u1', 'Хочу записаться'); const c = await load(id);
      assert.equal(c.direction, 'UNASSIGNED'); assert.equal(c.mode, 'HUMAN'); assert.equal(c.needsAttention, true); assert.equal(c.outbox.length, 0);
    });
    await t.test('a real service card asks once, keeps pet details through CRM handoff and leaves the excluded ozone ad to staff', async () => {
      const pilot = JSON.parse(readFileSync(new URL('../docs/plans/2026-10-19-avito-clinic-pilot.json', import.meta.url), 'utf8'));
      const before = await service.integration(); const id = chat('clinic-card'); const excludedId = chat('clinic-ozone');
      const card = pilot.settings.listings.find(item => item.id === '4962396005');
      const originalListing = api.listingId; const configured = f.model.configured; const classify = f.model.classify; let modelCalls = 0;
      api.listingId = value => value === id ? Number(card.id) : value === excludedId ? 4514134400 : originalListing.call(api, value);
      f.model.configured = () => true; f.model.classify = async () => { modelCalls++; return null; };
      try {
        await service.updateSettings({ version: before.settingsVersion, settings: { ...before.settings, listings: [...before.settings.listings, ...pilot.settings.listings] } }, actorId);
        api.add(id, 'card-1', 'Хочу записаться'); let c = await load(id);
        assert.equal(c.outbox.find(o => o.status === 'DRAFT').text, card.intakeQuestion); await approve(c);
        api.add(id, 'card-2', 'Кошка'); c = await load(id); assert.equal(c.contact.name, undefined); assert.equal(c.contact.serviceDetails, 'Кошка'); assert.equal(c.outbox.find(o => o.status === 'DRAFT').text, before.settings.templates.contactName);
        api.add(id, 'card-3', 'Анна'); c = await load(id); assert.equal(c.contact.name, 'Анна'); assert.equal(c.outbox.find(o => o.status === 'DRAFT').text, before.settings.templates.contactPhone);
        api.add(id, 'card-4', '+7 900 111-22-33'); c = await load(id); assert.equal(c.outbox.find(o => o.status === 'DRAFT').purpose, 'SUBMITTED'); assert.equal(c.inquiries.length, 1); assert.match(c.inquiries[0].summary, /Уточнение по услуге: Кошка/);
        assert.equal(c.inquiries[0].summary.match(/Уточнение по услуге/g).length, 1);
        const request = await prisma.onlineAppointmentRequest.findUniqueOrThrow({ where: { id: c.requestId } }); assert.equal(request.appointmentId, null); assert.equal(request.preferredAt, null);
        api.add(excludedId, 'ozone-1', 'Хочу записаться'); const excluded = await load(excludedId);
        assert.equal(excluded.mode, 'HUMAN'); assert.equal(excluded.direction, 'UNASSIGNED'); assert.equal(excluded.outbox.length, 0); assert.equal(excluded.inquiries.length, 0); assert.equal(modelCalls, 0);
      } finally {
        api.listingId = originalListing; f.model.configured = configured; f.model.classify = classify;
        const current = await service.integration(); await service.updateSettings({ version: current.settingsVersion, settings: before.settings }, actorId);
      }
    });
    await t.test('a named client-provided number immediately creates one CRM request before the delivered confirmation', async () => {
      const id = chat('clinic-callback'); api.add(id, 'c1', 'Хочу записаться, меня зовут Анна, +7 900 111-22-33');
      let c = await load(id); assert.equal(c.inquiries.length, 1); assert.equal(c.outbox[0].purpose, 'SUBMITTED');
      assert.equal(c.inquiries[0].contactBasis, 'CLIENT_PROVIDED_PHONE'); assert.equal(c.inquiries[0].contactMessageId, 'c1'); assert.equal(c.mode, 'HUMAN');
      await approve(c); api.add(id, 'c2', 'Спасибо'); c = await load(id);
      assert.equal(c.inquiries.length, 1); assert.equal(c.inquiries[0].direction, 'CLINIC'); assert.ok(c.requestId);
      const request = await prisma.onlineAppointmentRequest.findUniqueOrThrow({ where: { id: c.requestId } });
      assert.equal(request.source, 'AVITO'); assert.equal(request.status, 'NEW'); assert.equal(request.appointmentId, null); assert.equal(request.phone, '+79001112233');
      await load(id); assert.equal(await prisma.avitoInquiry.count({ where: { conversationId: c.id } }), 1);
      assert.equal(await prisma.onlineAppointmentRequest.count({ where: { externalRequestId: `avito:${c.id}:1` } }), 1);
      await assert.rejects(() => service.newCycle(c.id, c.version, actorId), /Сначала обработайте/);
      await service.inquiryStatus(c.inquiries[0].id, 'RESOLVED', actorId);
      const beforeConfirmed = (await service.metrics('CLINIC')).confirmedClinicAppointments;
      const owner = await prisma.owner.create({ data: { fullName: 'Тестовый владелец для проверки записи' } });
      const animal = await prisma.animal.create({ data: { ownerId: owner.id, nickname: 'Тестовый пациент', species: 'Кошка' } });
      const appointment = await prisma.appointment.create({ data: { ownerId: owner.id, animalId: animal.id, startsAt: new Date(Date.now() + 86400000) } });
      await prisma.onlineAppointmentRequest.update({ where: { id: c.requestId }, data: { status: 'ACCEPTED', appointmentId: appointment.id } });
      assert.equal((await service.metrics('CLINIC')).confirmedClinicAppointments, beforeConfirmed + 1);
      const resumed = await service.newCycle(c.id, c.version, actorId); assert.equal(resumed.intakeCycle, 2); assert.equal(resumed.requestId, null); assert.deepEqual(resumed.contact, {});
      assert.equal((await service.metrics('CLINIC')).confirmedClinicAppointments, beforeConfirmed + 1, 'new intake cycles do not erase past confirmed conversions');
    });
    await t.test('grooming and hotel requests use their own inbox and never create clinical appointments', async () => {
      for (const [prefix, direction] of [['groom', 'GROOMING'], ['hotel', 'HOTEL']]) {
        const id = chat(prefix); api.add(id, `${prefix}1`, 'Хочу записаться, меня зовут Анна, +7 900 111-22-33');
        const c = await load(id); assert.equal(c.direction, direction);
        assert.equal(c.inquiries.length, 1); assert.equal(c.inquiries[0].direction, direction); assert.equal(c.requestId, null);
        assert.equal(await prisma.onlineAppointmentRequest.count({ where: { externalRequestId: `avito:${c.id}:1` } }), 0);
      }
    });
    await t.test('a later do-not-call message cancels the open callback and its queued confirmation', async () => {
      const id = chat('clinic-no-call'); api.add(id, 'no-call-1', 'Хочу записаться, меня зовут Анна, +7 900 111-22-33'); let c = await load(id); assert.equal(c.inquiries.length, 1);
      const source = c.inquiries[0].contactMessageId; assert.equal(source, 'no-call-1');
      api.add(id, 'no-call-2', 'Не звоните, только здесь'); c = await load(id);
      assert.equal(c.inquiries[0].status, 'CANCELLED'); assert.equal(c.contact.callbackMessageId, undefined); assert.equal(c.mode, 'HUMAN'); assert.equal(c.outbox.filter(o => ['DRAFT', 'PENDING'].includes(o.status)).length, 0);
      assert.equal((await prisma.onlineAppointmentRequest.findUniqueOrThrow({ where: { id: c.requestId } })).status, 'CANCELLED');
    });
    await t.test('night callbacks print the CRM phone; changes to that number cancel a stale approved reply', async () => {
      const office = await prisma.clinicOffice.create({ data: { organizationId: 'avito-qa-org', name: `Ночная связь ${run}`, phone: '+7 900 000-00-01' } });
      const before = await service.integration(); const clock = service.now;
      try {
        await service.updateSettings({ version: before.settingsVersion, settings: { ...before.settings, administratorSchedule: { ...before.settings.administratorSchedule, officeId: office.id } } }, actorId);
        service.now = () => new Date('2026-10-19T19:00:00Z');
        const id = chat('clinic-night'); api.add(id, 'night-1', 'Хочу записаться, меня зовут Анна, +7 900 111-22-33'); const c = await load(id);
        const draft = c.outbox.find(o => o.status === 'DRAFT'); assert.ok(draft.text.includes(office.phone)); assert.match(draft.text, /дежурит один врач/); assert.match(draft.text, /в рабочее время/); assert.equal(c.inquiries.length, 1);
        const op = await service.reply(c.id, { clientKey: randomUUID(), version: c.version, draftId: draft.id, text: draft.text }, actorId);
        await prisma.clinicOffice.update({ where: { id: office.id }, data: { phone: '+7 900 000-00-02' } }); const count = api.sent.length; await service.deliver(op.operationId);
        assert.equal(api.sent.length, count); assert.equal((await prisma.avitoOutgoingOperation.findUniqueOrThrow({ where: { id: op.operationId } })).status, 'CANCELLED');
      } finally { service.now = clock; const current = await service.integration(); await service.updateSettings({ version: current.settingsVersion, settings: before.settings }, actorId); await prisma.clinicOffice.delete({ where: { id: office.id } }); }
    });
    await t.test('a price question with callback details answers the price and creates one inquiry without a second question', async () => {
      const item = await prisma.service.create({ data: { title: `Тестовая услуга ${run}`, price: 700, isActive: true } });
      try {
        const id = chat('clinic-price-callback'); api.add(id, 'price-callback-1', `Сколько стоит Тестовая услуга ${run}? Меня зовут Анна, мой номер телефона +7 900 111-22-33`); const c = await load(id);
        const d = c.outbox.find(o => o.status === 'DRAFT'); assert.equal(d.purpose, 'CRM_REPLY'); assert.match(d.text, /700/); assert.match(d.text, /Заявку передал/); assert.ok(!/разреш|согласи/i.test(d.text)); assert.equal(c.inquiries.length, 1);
        await approve(c); assert.equal(api.sent.at(-1).text, d.text);
        await load(id); assert.equal(await prisma.avitoInquiry.count({ where: { conversationId: c.id } }), 1);
      } finally { await prisma.service.delete({ where: { id: item.id } }); }
    });
    await t.test('new customer messages invalidate drafts, and staff takeover cancels queued sends', async () => {
      const id = chat('clinic-stale'); api.add(id, 's1', 'Здравствуйте'); const before = await load(id);
      const draft = before.outbox.find(o => o.status === 'DRAFT');
      api.add(id, 's2', 'Уточните адрес'); const after = await load(id);
      await assert.rejects(() => service.reply(before.id, { clientKey: randomUUID(), draftId: draft.id, version: before.version, text: draft.text }, actorId), /Появилось новое сообщение/);
      const d = after.outbox.find(o => o.status === 'DRAFT');
      const queued = await service.reply(after.id, { clientKey: randomUUID(), version: after.version, draftId: d.id, text: d.text }, actorId);
      const current = await service.getConversation(after.id); await service.setMode(after.id, { version: current.version, mode: 'HUMAN' }, actorId);
      const sentBefore = api.sent.length; await service.deliver(queued.operationId); assert.equal(api.sent.length, sentBefore);
      assert.equal((await prisma.avitoOutgoingOperation.findUniqueOrThrow({ where: { id: queued.operationId } })).status, 'CANCELLED');
    });
    await t.test('concurrent repeated syncs do not duplicate the incoming message or draft', async () => {
      const id = chat('clinic-concurrent'); api.add(id, 'concurrent-1', 'Здравствуйте'); const c = await load(id);
      api.add(id, 'concurrent-2', 'Уточните адрес');
      await Promise.all([service.syncChat(id), service.syncChat(id), service.syncChat(id)]);
      assert.equal(await prisma.avitoMessage.count({ where: { conversationId: c.id, externalId: 'concurrent-2' } }), 1);
      assert.equal(await prisma.avitoOutgoingOperation.count({ where: { conversationId: c.id, triggerMessageId: 'concurrent-2' } }), 1);
    });
    await t.test('an outgoing response written directly on Avito transfers control to staff', async () => {
      const id = chat('clinic-human'); api.add(id, 'h1', 'Здравствуйте'); let c = await load(id);
      api.add(id, 'h2', 'Сотрудник уже отвечает', { direction: 'out', author_id: api.accountId });
      api.add(id, 'h3', 'Можно записаться?'); c = await load(id);
      assert.equal(c.mode, 'HUMAN'); assert.equal(c.outbox.filter(o => o.status === 'DRAFT').length, 0);
    });
    await t.test('uncertain sends are durable, are not retried, and can be reconciled against history', async () => {
      const id = chat('clinic-uncertain'); api.add(id, 'r1', 'Здравствуйте'); const c = await load(id);
      const d = c.outbox.find(o => o.status === 'DRAFT'); const clientKey = randomUUID(); const input = { clientKey, version: c.version, text: d.text, draftId: d.id };
      const a = await service.reply(c.id, input, actorId); const b = await service.reply(c.id, input, actorId); assert.equal(a.operationId, b.operationId);
      api.failSend = true; await service.deliver(a.operationId); api.failSend = false;
      let op = await prisma.avitoOutgoingOperation.findUniqueOrThrow({ where: { id: a.operationId } }); assert.equal(op.status, 'UNCERTAIN');
      const paused = await service.getConversation(c.id); assert.equal(paused.mode, 'PAUSED'); assert.equal(paused.needsAttention, true);
      const sentBefore = api.sent.length; await service.deliver(a.operationId); assert.equal(api.sent.length, sentBefore);
      const reconciled = await service.reconcile(a.operationId, actorId); assert.equal(reconciled.status, 'SENT');
    });
    await t.test('manual calls are idempotent and do not masquerade as messages, leads or appointments', async () => {
      const before = await service.metrics('CLINIC'); const dto = { clientKey: randomUUID(), direction: 'CLINIC', occurredAt: new Date().toISOString(), missed: true, note: 'Тестовый пропущенный звонок' };
      const a = await service.recordCall(dto, actorId); const b = await service.recordCall(dto, actorId); assert.equal(a.id, b.id);
      const after = await service.metrics('CLINIC'); assert.equal(after.calls, before.calls + 1); assert.equal(after.inquiries, before.inquiries); assert.equal(after.conversations, before.conversations); assert.equal(after.confirmedClinicAppointments, before.confirmedClinicAppointments);
    });
    await t.test('CRM price changes cancel an approved old price before transport; ready inquiries include owner, provided-number evidence and source only after completion', async () => {
      const item = await prisma.service.create({ data: { title: `Тестовая услуга ${run}`, price: 700, isActive: true } });
      try {
        const id = chat('clinic-live-price'); api.add(id, 'price-1', `Сколько стоит Тестовая услуга ${run}?`); let c = await load(id);
        const d = c.outbox.find(o => o.status === 'DRAFT'); assert.equal(d.purpose, 'CRM_REPLY'); assert.match(d.text, /700/);
        const op = await service.reply(c.id, { clientKey: randomUUID(), version: c.version, text: d.text, draftId: d.id }, actorId);
        await prisma.service.update({ where: { id: item.id }, data: { price: 900 } });
        const before = api.sent.length; await service.deliver(op.operationId); assert.equal(api.sent.length, before);
        assert.equal((await prisma.avitoOutgoingOperation.findUniqueOrThrow({ where: { id: op.operationId } })).status, 'CANCELLED');
        assert.match((await service.simulate('101', `Цена Тестовая услуга ${run}`)).decision.text, /900/);
        const queue = await service.listInquiries({ direction: 'CLINIC' }); assert.equal(queue.recipientRole, 'administrator');
        assert.ok(queue.items.every(row => row.contactName && row.phone && row.contactRecordedAt && row.contactMessageId && row.conversation.listingId));
        assert.ok(queue.items.every(row => row.conversationId !== c.id));
      } finally { await prisma.service.delete({ where: { id: item.id } }); }
    });
    await t.test('AI interpretation can start contact collection but cannot create a booking; duplicate reads do not call it again', async () => {
      const priorConfigured = f.model.configured; const priorClassify = f.model.classify; let calls = 0;
      f.model.configured = () => true; f.model.classify = async () => { calls++; return { action: 'BOOKING', knowledgeId: null, serviceQuery: null }; };
      try {
        const id = chat('clinic-ai'); api.add(id, 'ai-1', 'Планируем визит с питомцем'); const c = await load(id);
        assert.equal(c.outbox.find(o => o.status === 'DRAFT').purpose, 'CONTACT'); assert.equal(c.inquiries.length, 0); assert.equal(c.requestId, null);
        await load(id); assert.equal(calls, 1);
      } finally { f.model.configured = priorConfigured; f.model.classify = priorClassify; }
    });
    await t.test('the model receives previous client turns and confirmed replies only from this conversation', async () => {
      const id = chat('clinic-context');
      api.add(id, 'context-1', 'Хочу записаться'); const first = await load(id); await approve(first);
      api.add(id, 'context-2', 'Нужно УЗИ для кошки'); await load(id);
      const priorConfigured = f.model.configured; const priorClassify = f.model.classify; let context;
      f.model.configured = () => true;
      f.model.classify = async (...args) => {
        context = args[5];
        return { action: 'HOURS', knowledgeId: null, serviceQuery: null, questions: [{ kind: 'HOURS', text: args[2], serviceQuery: 'УЗИ' }] };
      };
      try {
        api.add(id, 'context-3', 'А в какие дни он принимает?'); await load(id);
        assert.deepEqual(context.filter(turn => turn.role === 'user').map(turn => turn.text), ['Хочу записаться', 'Нужно УЗИ для кошки']);
        assert.equal(context.filter(turn => turn.role === 'assistant').length, 1, 'an undelivered draft is not a confirmed assistant reply');
        assert.equal(context.find(turn => turn.role === 'assistant').text, first.outbox.find(op => op.status === 'DRAFT').text);
        assert.ok(!JSON.stringify(context).includes('А в какие дни он принимает?'), 'the current message is sent separately');
      } finally { f.model.configured = priorConfigured; f.model.classify = priorClassify; }
    });
    await t.test('a human takeover during a model request suppresses the late model result', async () => {
      const priorConfigured = f.model.configured; const priorClassify = f.model.classify;
      let start; let release; const started = new Promise(resolve => { start = resolve; }); const wait = new Promise(resolve => { release = resolve; });
      f.model.configured = () => true; f.model.classify = async () => { start(); await wait; return { action: 'BOOKING', knowledgeId: null, serviceQuery: null }; };
      try {
        const id = chat('clinic-ai-takeover'); api.add(id, 'ai-late-1', 'Планируем визит с питомцем'); const pending = service.syncChat(id);
        await started; const c = await prisma.avitoConversation.findUniqueOrThrow({ where: { integrationId_externalChatId: { integrationId: f.integration.id, externalChatId: id } } });
        await service.setMode(c.id, { mode: 'HUMAN', version: c.version }, actorId); release(); await pending;
        const final = await service.getConversation(c.id); assert.equal(final.mode, 'HUMAN'); assert.equal(final.outbox.filter(o => ['DRAFT', 'PENDING'].includes(o.status)).length, 0); assert.equal(final.inquiries.length, 0);
      } finally { release(); f.model.configured = priorConfigured; f.model.classify = priorClassify; }
    });
    await t.test('medical intake can finish administrative contacts while an urgent message immediately stops the collection bot', async () => {
      const id = chat('clinic-medical-ready'); api.add(id, 'med-1', 'Кошка хромает, чем лечить?'); let c = await load(id);
      assert.equal(c.mode, 'BOT'); assert.equal(c.needsAttention, true); assert.equal(c.inquiries.length, 0);
      api.add(id, 'med-2', 'Меня зовут Анна, +7 900 111-22-33'); c = await load(id); assert.equal(c.outbox.find(o => o.status === 'DRAFT').purpose, 'SUBMITTED'); assert.equal(c.inquiries.length, 1); assert.equal(c.mode, 'HUMAN'); assert.ok(c.requestId);
      const request = await prisma.onlineAppointmentRequest.findUniqueOrThrow({ where: { id: c.requestId } }); assert.equal(request.appointmentId, null); assert.equal(request.preferredAt, null);
      const urgent = chat('clinic-urgent-contact'); api.add(urgent, 'urgent-1', 'Хочу записаться'); await load(urgent); api.add(urgent, 'urgent-2', 'Кот не дышит'); const stopped = await load(urgent); assert.equal(stopped.mode, 'HUMAN'); assert.equal(stopped.needsAttention, true);
    });
    await t.test('changing rules cancels automatic drafts and stale versions cannot overwrite changes', async () => {
      const id = chat('clinic-settings'); api.add(id, 'v1', 'Здравствуйте'); const c = await load(id);
      const current = await service.integration();
      const updated = await service.updateSettings({ version: current.settingsVersion, settings: current.settings }, actorId);
      await assert.rejects(() => service.updateSettings({ version: current.settingsVersion, settings: current.settings }, actorId), /другой вкладке/);
      assert.equal((await service.getConversation(c.id)).outbox.filter(o => o.status === 'DRAFT').length, 0);
      assert.ok((await service.revisions()).some(v => v.version === updated.version));
    });
    await t.test('disable cancels pending work; commercial entitlement and account identity are enforced', async () => {
      const current = await modules.installation('avito-administrator'); await modules.setEnabled('avito-administrator', false, current.version, actorId);
      await assert.rejects(() => service.sync(), /отключён/);
      license.enforcementActive = true; license.status = 'VALID'; license.features = [];
      const disabled = await modules.installation('avito-administrator'); await assert.rejects(() => modules.setEnabled('avito-administrator', true, disabled.version, actorId), /лицензию/);
      license.features = ['avito-administrator']; await modules.setEnabled('avito-administrator', true, disabled.version, actorId);
      api.accountId = 999999; await assert.rejects(() => service.checkConnection(actorId), /другому профилю/); api.accountId = 900001;
      license.enforcementActive = false;
    });
    await t.test('public events validate the secret and bound account, and store only identifiers once', async () => {
      process.env.AVITO_WEBHOOK_SECRET = 'avito-qa-secret-not-for-production-00000000';
      const payload = { payload: { value: { user_id: 900001, chat_id: chat('clinic-event'), id: `event-${run}`, content: { text: 'not persisted from webhook' } } } };
      await assert.rejects(() => service.acceptEvent('wrong', payload), /не принято/);
      await assert.rejects(() => service.acceptEvent(process.env.AVITO_WEBHOOK_SECRET, { payload: { value: { ...payload.payload.value, user_id: 111 } } }), /профилю/);
      await service.acceptEvent(process.env.AVITO_WEBHOOK_SECRET, payload); await service.acceptEvent(process.env.AVITO_WEBHOOK_SECRET, payload);
      const events = await prisma.avitoIncomingEvent.findMany({ where: { externalChatId: payload.payload.value.chat_id } }); assert.equal(events.length, 1); assert.ok(!JSON.stringify(events).includes('not persisted'));
      assert.equal(events[0].status, 'PENDING');
      api.add(payload.payload.value.chat_id, payload.payload.value.id, 'Здравствуйте');
      await service.syncChat(payload.payload.value.chat_id);
      assert.equal((await prisma.avitoIncomingEvent.findUniqueOrThrow({ where: { id: events[0].id } })).status, 'DONE');
      delete process.env.AVITO_WEBHOOK_SECRET;
    });
  } finally { await prisma.$disconnect(); }
});
