import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { avitoFixture } from './helpers/avito-fixture.mjs';

test('pet-service conversations use isolated PostgreSQL, module facts and separate administrator queues', { skip: !process.env.AVITO_QA_DATABASE_URL }, async t => {
  const f = await avitoFixture(); const { prisma, service, api, actorId } = f;
  const suffix = randomUUID().slice(0, 8), own = new Set();
  const chat = prefix => { const id = `${prefix}-pet-directions-${suffix}`; own.add(id); return id; };
  const load = async id => { await service.syncChat(id); const row = await prisma.avitoConversation.findUniqueOrThrow({ where: { integrationId_externalChatId: { integrationId: f.integration.id, externalChatId: id } } }); return service.getConversation(row.id); };
  const approve = c => service.reply(c.id, { clientKey: randomUUID(), text: c.outbox.find(x => x.status === 'DRAFT').text, draftId: c.outbox.find(x => x.status === 'DRAFT').id, version: c.version }, actorId);
  const org = (await prisma.clinicModuleInstallation.findUniqueOrThrow({ where: { id: f.integration.installationId } })).organizationId;
  const grooming = await prisma.clinicModuleInstallation.upsert({ where: { organizationId_moduleKey: { organizationId: org, moduleKey: 'GROOMING' } }, create: { organizationId: org, moduleKey: 'GROOMING', enabled: true }, update: { enabled: true } });
  await prisma.groomingSettings.upsert({ where: { installationId: grooming.id }, create: { installationId: grooming.id, selfBookingEnabled: false }, update: { selfBookingEnabled: false } });
  const hotel = await prisma.clinicModuleInstallation.upsert({ where: { organizationId_moduleKey: { organizationId: org, moduleKey: 'PET_HOTEL' } }, create: { organizationId: org, moduleKey: 'PET_HOTEL', enabled: true }, update: { enabled: true } });
  await prisma.petHotelSettings.upsert({ where: { installationId: hotel.id }, create: { installationId: hotel.id, selfBookingEnabled: true }, update: { selfBookingEnabled: true } });
  const room = await prisma.petHotelRoom.upsert({ where: { installationId_code: { installationId: hotel.id, code: 'AVITO-PET-QA' } }, create: { installationId: hotel.id, code: 'AVITO-PET-QA', name: 'Синтетический номер', species: 'CAT', dailyRate: 700 }, update: { dailyRate: 700, isActive: true } });
  const clinicalBefore = await prisma.onlineAppointmentRequest.count();
  const groomingBookingsBefore = await prisma.groomingReservation.count(), hotelBookingsBefore = await prisma.petHotelReservation.count();
  try {
    await t.test('a system-only chat stays ready for the first actual customer message without unsolicited replies', async () => {
      const id=chat('groom-system-only');
      api.add(id,'system-1','[Системное сообщение] Пользователь создал чат, но пока ничего не написал. Напишите первыми!',{type:'system',author_id:0});
      const empty=await load(id);assert.equal(empty.mode,'BOT');assert.equal(empty.needsAttention,false);assert.equal(empty.outbox.length,0);assert.equal(empty.inquiries.length,0);assert.equal(empty.messages.length,1);
      const savedVersion=empty.version;await load(id);assert.equal((await service.getConversation(empty.id)).version,savedVersion);
      api.add(id,'real-first','Хочу записаться на стрижку');const first=await load(id);assert.equal(first.stage,'PET_SERVICE_INFO');assert.equal(first.mode,'BOT');assert.equal(first.inquiries.length,0);assert.equal(first.outbox.length,1);
      const op=await approve(first);await service.deliver(op.operationId);assert.equal((await service.getConversation(first.id)).outbox.find(x=>x.id===op.operationId).status,'SENT');
      assert.equal(api.sent.filter(x=>x.chatId===id).length,1);
    });
    await t.test('a later system notification preserves the customer reply already awaiting delivery', async () => {
      const id=chat('groom-system-after');api.add(id,'customer-1','Хочу записаться');const first=await load(id);const op=await approve(first);const before=await service.getConversation(first.id);
      api.add(id,'system-after','Системное уведомление',{type:'system',author_id:0});const after=await load(id);
      assert.equal(after.version,before.version);assert.equal(after.mode,'BOT');assert.equal(after.needsAttention,false);assert.equal(after.outbox.find(x=>x.id===op.operationId).status,'PENDING');assert.deepEqual(after.outbox.map(x=>[x.id,x.status]),before.outbox.map(x=>[x.id,x.status]));
      await service.deliver(op.operationId);assert.equal((await service.getConversation(first.id)).outbox.find(x=>x.id===op.operationId).status,'SENT');assert.equal(api.sent.filter(x=>x.chatId===id).length,1);
    });
    await t.test('a trailing system notification cannot hide the latest customer question from the model', async () => {
      const configured=f.model.configured,classify=f.model.classify;let calls=0;
      f.model.configured=()=>true;f.model.classify=async()=>{calls++;return{action:'BOOKING'};};
      try{
        const id=chat('groom-system-model');api.add(id,'question-1','Можно оформить визит?');api.add(id,'trailing-system','Системное уведомление',{type:'system',author_id:0});const c=await load(id);
        assert.equal(calls,1);assert.equal(c.stage,'PET_SERVICE_INFO');assert.equal(c.mode,'BOT');assert.equal(c.outbox.length,1);assert.equal(c.outbox[0].triggerMessageId,'question-1');
      }finally{f.model.configured=configured;f.model.classify=classify;}
    });
    await t.test('system notifications never resume a conversation already controlled by staff', async () => {
      const id=chat('groom-system-human');api.add(id,'human-question','Хочу записаться');const first=await load(id);
      await service.setMode(first.id,{mode:'HUMAN',version:first.version},actorId);const before=await service.getConversation(first.id);const sent=api.sent.length;
      api.add(id,'system-in-human','Системное уведомление',{type:'system',direction:'out',author_id:api.accountId});const after=await load(id);
      assert.equal(after.mode,'HUMAN');assert.equal(after.version,before.version);assert.equal(after.needsAttention,true);assert.equal(api.sent.length,sent);assert.deepEqual(after.outbox.map(x=>[x.id,x.status]),before.outbox.map(x=>[x.id,x.status]));
    });
    await t.test('site referrals persist without collecting callback contacts or creating bookings', async () => {
      for (const [prefix, request, expected] of [['groom', 'Хочу записаться на стрижку', /пока закрыта/], ['hotel', 'Сколько стоит и как забронировать?', /700 ₽/]]) {
        const id = chat(prefix); api.add(id, 'site-1', request); const c = await load(id);
        assert.equal(c.stage, 'PET_SERVICE_INFO'); assert.equal(c.contact.collecting, undefined); assert.equal(c.inquiries.length, 0);
        const draft = c.outbox.find(x => x.status === 'DRAFT'); assert.match(draft.text, expected); assert.deepEqual(draft.replyContext, prefix === 'groom' ? { petService: true, groomingAdministratorWindow: 'WORKING' } : { petService: true });
        const operation = await approve(c); await service.deliver(operation.operationId);
        assert.equal((await service.getConversation(c.id)).outbox.find(x => x.id === operation.operationId).status, 'SENT');
        assert.equal(await prisma.groomingReservation.count(), groomingBookingsBefore); assert.equal(await prisma.petHotelReservation.count(), hotelBookingsBefore);
      }
    });
    await t.test('website source pairs use their own mapped listing and survive simulation, reload and delivery', async () => {
      for(const [prefix,listingId,path] of [['groom-source','202','/'],['hotel-source','303','/pet-hotel/']]){
        const question='Дайте сайт для записи',id=chat(prefix);api.add(id,'source-1',question);const c=await load(id);
        const draft=c.outbox.find(x=>x.status==='DRAFT'),url=new URL(draft.text.split('\n').find(x=>x.startsWith('https://')));
        assert.equal(url.pathname,path);assert.deepEqual([...url.searchParams],[['utm_source','avito'],['listing_id',listingId]]);assert.equal(url.hash,'');
        const sim=await service.simulate(listingId,question);assert.ok(sim.decision.text.includes(url.href));assert.equal(sim.persisted,false);
        const op=await approve(c);await service.deliver(op.operationId);const reopened=await service.getConversation(c.id);
        assert.equal(reopened.outbox.find(x=>x.id===op.operationId).status,'SENT');assert.equal(api.sent.filter(x=>x.chatId===id).length,1);assert.equal(reopened.inquiries.length,0);
      }
      assert.equal(await prisma.groomingReservation.count(),groomingBookingsBefore);assert.equal(await prisma.petHotelReservation.count(),hotelBookingsBefore);
    });
    await t.test('a short Avito choice persists through reload and creates one grooming callback from the actual contact message', async () => {
      const id=chat('groom-choice'); api.add(id,'choice-1','Хочу записаться на стрижку'); let c=await load(id);
      assert.equal(c.contact.bookingChoiceOffered,true); assert.equal(c.inquiries.length,0);
      api.add(id,'choice-2','Здесь'); c=await load(id);
      assert.equal(c.contact.bookingChannel,'CALLBACK'); assert.equal(c.contact.name,undefined); assert.equal(c.inquiries.length,0);
      api.add(id,'choice-3','Анна'); c=await load(id); assert.equal(c.contact.name,'Анна');
      api.add(id,'choice-4','Мой номер +7 900 111-22-33'); c=await load(id);
      assert.equal(c.inquiries.length,1); assert.equal(c.inquiries[0].direction,'GROOMING'); assert.equal(c.inquiries[0].contactMessageId,'choice-4');
      assert.equal(c.requestId,null); assert.equal(await prisma.onlineAppointmentRequest.count(),clinicalBefore);
      await load(id); assert.equal((await service.getConversation(c.id)).inquiries.length,1);
      assert.equal(await prisma.groomingReservation.count(),groomingBookingsBefore);
    });
    await t.test('a website choice is replayable for delivery and does not collect callback contacts', async () => {
      const id=chat('groom-website-choice'); api.add(id,'web-choice-1','Хочу записаться'); let c=await load(id);
      api.add(id,'web-choice-2','Самостоятельно'); c=await load(id);
      assert.equal(c.contact.bookingChannel,'WEBSITE'); assert.equal(c.contact.collecting,undefined); assert.equal(c.inquiries.length,0);
      const draft=c.outbox.find(x=>x.status==='DRAFT'); assert.match(draft.text,/пока закрыта/); assert.match(draft.text,/pet.temichevvet.ru/);
      assert.deepEqual(draft.replyContext,{petService:true,bookingIntent:true,bookingChannel:'WEBSITE',groomingAdministratorWindow:'WORKING'});
      const op=await approve(c); await service.deliver(op.operationId);
      assert.equal((await service.getConversation(c.id)).outbox.find(x=>x.id===op.operationId).status,'SENT');
    });
    await t.test('a price change after drafting cancels the stale outgoing reply before delivery', async () => {
      const id = chat('hotel-stale'); api.add(id, 'stale-1', 'Сколько стоит номер?'); const c = await load(id); const operation = await approve(c);
      const sent = api.sent.length; await prisma.petHotelRoom.update({ where: { id: room.id }, data: { dailyRate: 750 } });
      await service.deliver(operation.operationId);
      assert.equal((await service.getConversation(c.id)).outbox.find(x => x.id === operation.operationId).status, 'CANCELLED'); assert.equal(api.sent.length, sent);
      await prisma.petHotelRoom.update({ where: { id: room.id }, data: { dailyRate: 700 } });
    });
    await t.test('night callbacks persist in the grooming queue, and stale working-hour replies are not sent', async () => {
      const savedNow=service.now;
      try {
        service.now=()=>new Date('2026-10-21T15:59:59Z');
        const id=chat('groom-closing');api.add(id,'closing-1','Хочу записаться');const c=await load(id);const op=await approve(c);
        service.now=()=>new Date('2026-10-21T16:00:00Z');const sent=api.sent.length;await service.deliver(op.operationId);
        assert.equal((await service.getConversation(c.id)).outbox.find(x=>x.id===op.operationId).status,'CANCELLED');assert.equal(api.sent.length,sent);
        const night=chat('groom-night');api.add(night,'night-1','Перезвоните, меня зовут Анна, +7 900 111-22-33');const n=await load(night);
        assert.equal(n.inquiries.length,1);assert.equal(n.inquiries[0].direction,'GROOMING');assert.equal(n.requestId,null);
        const draft=n.outbox.find(x=>x.status==='DRAFT');assert.match(draft.text,/Заявку сохранил/);assert.match(draft.text,/завтра после 09:00/);
        const delivered=await approve(n);await service.deliver(delivered.operationId);assert.equal((await service.getConversation(n.id)).outbox.find(x=>x.id===delivered.operationId).status,'SENT');
        await load(night);assert.equal((await service.getConversation(n.id)).inquiries.length,1);
      } finally {service.now=savedNow;}
    });
    await t.test('free wording recognized as booking retains its site referral through delivery validation', async () => {
      const configured = f.model.configured, classify = f.model.classify;
      f.model.configured = () => true; f.model.classify = async () => ({ action: 'BOOKING' });
      try {
        const id = chat('hotel-free-wording'); api.add(id, 'free-1', 'Можно оформить визит?'); const c = await load(id);
        assert.equal(c.stage, 'PET_SERVICE_INFO'); assert.equal(c.contact.collecting, undefined); assert.equal(c.inquiries.length, 0);
        assert.deepEqual(c.outbox.find(x => x.status === 'DRAFT').replyContext, { petService: true, bookingIntent: true });
        const operation = await approve(c); await service.deliver(operation.operationId);
        assert.equal((await service.getConversation(c.id)).outbox.find(x => x.id === operation.operationId).status, 'SENT');
      } finally { f.model.configured = configured; f.model.classify = classify; }
    });
    await t.test('explicit callback requests stay in the proper pet-service queue and never become clinical appointment requests', async () => {
      for (const prefix of ['groom-callback', 'hotel-callback']) {
        const id = chat(prefix); api.add(id, 'callback-1', 'Перезвоните, меня зовут Анна, +7 900 111-22-33'); const c = await load(id);
        assert.equal(c.inquiries.length, 1); assert.equal(c.inquiries[0].direction, prefix.startsWith('groom') ? 'GROOMING' : 'HOTEL'); assert.equal(c.requestId, null);
        assert.match(c.outbox.find(x => x.status === 'DRAFT').text, prefix.startsWith('groom') ? /администратору груминга/ : /сотруднику зоогостиницы/);
        await load(id); assert.equal((await service.getConversation(c.id)).inquiries.length, 1);
      }
      assert.equal(await prisma.onlineAppointmentRequest.count(), clinicalBefore);
    });
    await t.test('all direction filters and a reopened persisted conversation keep each business separate', async () => {
      for (const direction of ['CLINIC', 'GROOMING', 'HOTEL']) {
        const chats = await service.listConversations({ direction }); assert.ok(chats.items.every(x => x.direction === direction));
        const inquiries = await service.listInquiries({ direction }); assert.ok(inquiries.items.every(x => x.direction === direction));
        if (direction !== 'CLINIC') { assert.ok(chats.items.some(x => own.has(x.externalChatId))); assert.ok(inquiries.items.some(x => x.conversation.externalChatId?.includes(suffix) || x.summary.includes('Перезвоните'))); }
      }
      const c = await prisma.avitoConversation.findFirstOrThrow({ where: { externalChatId: { in: [...own] }, direction: 'HOTEL', stage: 'PET_SERVICE_INFO' } });
      assert.equal((await service.getConversation(c.id)).direction, 'HOTEL');
    });
    await t.test('binding an advertisement classifies its old unassigned history without restarting the bot', async () => {
      const before = await service.integration();
      await service.updateSettings({ version: before.settingsVersion, settings: { ...before.settings, listings: before.settings.listings.filter(x => x.id !== '303') } }, actorId);
      const id = chat('hotel-history'); api.add(id, 'old-1', 'Здравствуйте'); const old = await load(id);
      assert.equal(old.direction, 'UNASSIGNED'); assert.equal(old.mode, 'HUMAN'); assert.equal(old.outbox.length, 0);
      const current = await service.integration(), sent = api.sent.length;
      await service.updateSettings({ version: current.settingsVersion, settings: before.settings }, actorId);
      const classified = await service.getConversation(old.id);
      assert.equal(classified.direction, 'HOTEL'); assert.equal(classified.mode, 'HUMAN'); assert.equal(classified.outbox.length, 0); assert.equal(api.sent.length, sent);
      assert.ok((await service.listConversations({ direction: 'HOTEL' })).items.some(x => x.id === old.id));
      assert.ok(!(await service.listConversations({ direction: 'CLINIC' })).items.some(x => x.id === old.id));
    });
  } finally { await prisma.$disconnect(); }
});
