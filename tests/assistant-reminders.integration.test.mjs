import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaClient as GatewayDb } from '../apps/owner-gateway/src/generated/client/index.js';
import { OwnerNotificationService } from '../apps/owner-gateway/dist/owner-notification.service.js';
import { AssistantReminderService } from '../apps/api/dist/modules/notifications/assistant-reminder.service.js';
import { AppointmentsService } from '../apps/api/dist/modules/appointments/appointments.service.js';
import { SchedulingService } from '../apps/api/dist/modules/scheduling/scheduling.service.js';
import { AuditService } from '../apps/api/dist/modules/audit/audit.service.js';
import { NotificationsService } from '../apps/api/dist/modules/notifications/notifications.service.js';
import { NotificationDispatcherService } from '../apps/api/dist/modules/notifications/notification-dispatcher.service.js';
import { hashToken } from '../apps/owner-gateway/dist/security.js';
const url = process.env.ASSISTANT_TEST_DATABASE_URL, gatewayUrl = process.env.ASSISTANT_TEST_GATEWAY_DATABASE_URL;
test('isolated PostgreSQL: reminders default on, opt-out and durable delivery', { skip: !url || !gatewayUrl }, async t => {
  for (const [value, name] of [[url,'crm_assistant_qa'],[gatewayUrl,'crm_assistant_gateway_qa']]) { const u = new URL(value); assert.equal(u.hostname,'127.0.0.1'); assert.equal(u.port,'15488'); assert.equal(u.pathname,`/${name}`); }
  Object.assign(process.env, { CLINIC_ASSISTANT_REMINDERS_ENABLED: 'true', CLINIC_ASSISTANT_NOTIFICATION_DAILY_LIMIT: '3' });
  const db = new PrismaClient({ datasources: { db: { url } } }), gateway = new GatewayDb({ datasources: { db: { url: gatewayUrl } } });
  const owners = [], sends = [], now = new Date('2026-10-08T10:00:00Z');
  const max = { sendMessage: async (user,text) => { sends.push({ user,text }); return { messageId: randomUUID() }; } };
  const policy = new OwnerNotificationService(gateway,max), core = new AssistantReminderService(db);
  core.gateway = async (path, body) => path === '/subscribers' ? (await policy.subscribers()).filter(x => owners.includes(x.ownerId)) : path.endsWith('/result') ? policy.result(path.split('/')[1],now) : policy.deliver(path.split('/')[1],body,now);
  const audit = new AuditService(db), appointments = new AppointmentsService(db,audit,new SchedulingService(db,audit));
  t.after(async () => { await db.notificationOutbox.updateMany({ where: { ownerId: { in: owners }, status: { in: ['QUEUED','SENDING','FAILED'] } }, data: { status: 'CANCELLED' } }); await db.$disconnect(); await gateway.$disconnect(); });
  async function fixture(linked = true) {
    const owner = await db.owner.create({ data: { fullName: 'Synthetic reminder owner', phone: '+79990000001' } }); owners.push(owner.id);
    await db.clientPortalAccess.create({ data: { ownerId: owner.id, status: 'ENABLED' } });
    const animal = await db.animal.create({ data: { ownerId: owner.id, nickname: 'Synthetic reminder cat' } });
    await gateway.ownerSnapshot.create({ data: { ownerId: owner.id, displayName: 'Synthetic reminder owner', payload: {}, sourceVersion: 'synthetic', sourceUpdatedAt: now } });
    const token = randomBytes(32).toString('base64url');
    const session = await gateway.portalSession.create({ data: { ownerId: owner.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3600000) } });
    const externalUserId = `qa-reminder-${randomUUID()}`;
    if (linked) await gateway.messengerBinding.create({ data: { ownerId: owner.id, channel: 'MAX', externalUserId } });
    return { owner, animal, token, session, externalUserId };
  }
  const input = (f, kind = 'APPOINTMENT_REMINDER') => ({ ownerId: f.owner.id, kind, text: 'TemichevVet: синтетическое напоминание.', expiresAt: new Date(now.getTime()+86400000).toISOString() });
  async function preference(f, patch = {}) { const current = (await policy.read(f.token)).preference; const { enabled, appointmentChanges, appointmentReminders, revisitReminders, vaccinationReminders, channel, timezone, quietStartMinute, quietEndMinute } = current; return policy.save(f.token,{ enabled, appointmentChanges, appointmentReminders, revisitReminders, vaccinationReminders, channel, timezone, quietStartMinute, quietEndMinute, ...patch }); }
  async function makeAppointment(f) {
    const org = await db.organization.create({ data: { displayName: 'Synthetic reminder clinic' } });
    const office = await db.clinicOffice.create({ data: { organizationId: org.id, name: 'Synthetic reminder office', timezone: 'Europe/Moscow' } });
    const actor = await db.employee.create({ data: { fullName: 'Synthetic reminder administrator' } });
    const appointment = await db.appointment.create({ data: { officeId: office.id, ownerId: f.owner.id, animalId: f.animal.id, startsAt: new Date(now.getTime()+20*3600000), endsAt: new Date(now.getTime()+21*3600000) } });
    return { appointment, actor };
  }
  const rows = f => db.notificationOutbox.findMany({ where: { ownerId: f.owner.id }, orderBy: { createdAt: 'asc' } });
  await t.test('all four kinds are ON for a new registered owner; reads preserve saved opt-outs', async () => {
    const f = await fixture();
    assert.ok((await policy.subscribers()).some(x => x.ownerId === f.owner.id && x.vaccinationReminders));
    const state = await policy.read(f.token);
    for (const key of ['enabled','appointmentChanges','appointmentReminders','revisitReminders','vaccinationReminders']) assert.equal(state.preference[key],true);
    await preference(f,{ vaccinationReminders: false });
    assert.equal((await policy.read(f.token)).preference.vaccinationReminders,false);
    assert.equal((await policy.deliver(randomUUID(),input(f,'VACCINATION'),now)).status,'NO_CONSENT');
    assert.equal((await policy.deliver(randomUUID(),input(f),now)).status,'SENT');
    assert.equal(sends.filter(x=>x.user===f.externalUserId).length,1);
  });
  await t.test('guest, revoked session, invalid timezone and an unlinked MAX cannot send', async () => {
    const f = await fixture(false);
    await assert.rejects(policy.read(), /личный кабинет/);
    await assert.rejects(preference(f,{timezone:'invalid'}), /часовой пояс/);
    assert.equal((await policy.deliver(randomUUID(),input(f),now)).status,'NOT_LINKED');
    await gateway.portalSession.update({ where: { id:f.session.id }, data: { revokedAt:new Date() } });
    await assert.rejects(policy.unsubscribe(f.token), /личный кабинет/);
    assert.equal(sends.filter(x=>x.user===f.externalUserId).length,0);
  });
  await t.test('unsubscribe creates an opt-out even before first preferences read and remains OFF', async () => {
    const f = await fixture(); await policy.unsubscribe(f.token);
    await gateway.ownerSnapshot.update({ where: { ownerId:f.owner.id }, data: { sourceUpdatedAt:new Date() } });
    assert.equal((await policy.read(f.token)).preference.enabled,false);
    assert.equal((await policy.deliver(randomUUID(),input(f),now)).status,'NO_CONSENT');
    assert.ok(!(await policy.subscribers()).some(x=>x.ownerId===f.owner.id));
  });
  await t.test('registered MAX stop also persists the global opt-out; foreign account changes nothing', async () => {
    const f = await fixture(); assert.equal(await policy.unsubscribeByMax('unknown-synthetic-user'),false);
    assert.equal(await policy.unsubscribeByMax(f.externalUserId),true);
    assert.equal((await policy.read(f.token)).preference.enabled,false);
  });
  await t.test('quiet hours defer without a send; expired reminders are never sent later', async () => {
    const f = await fixture(), night = new Date('2026-10-08T20:00:00Z');
    const dto = { ...input(f), expiresAt:'2026-10-10T10:00:00Z' };
    const result = await policy.deliver(randomUUID(),dto,night);
    assert.equal(result.status,'DEFERRED'); assert.equal(result.retryAt,'2026-10-09T05:00:00.000Z');
    assert.equal((await policy.deliver(randomUUID(),{...dto,expiresAt:night.toISOString()},night)).status,'EXPIRED');
    assert.equal(sends.filter(x=>x.user===f.externalUserId).length,0);
  });
  await t.test('daily cap is atomic across two workers; ambiguous sends consume a slot', async () => {
    const f = await fixture(), other = new OwnerNotificationService(gateway,max);
    const results = await Promise.all(Array.from({length:5},(_,i)=>(i%2?other:policy).deliver(randomUUID(),input(f),now)));
    assert.equal(results.filter(x=>x.status==='SENT').length,3); assert.equal(results.filter(x=>x.status==='DEFERRED').length,2);
    assert.equal(sends.filter(x=>x.user===f.externalUserId).length,3);
  });
  await t.test('duplicate ID and response loss cannot send twice; changed payload is rejected', async () => {
    const f = await fixture(), id = randomUUID(), dto=input(f);
    await Promise.all([policy.deliver(id,dto,now),new OwnerNotificationService(gateway,max).deliver(id,dto,now)]);
    assert.equal((await policy.deliver(id,dto,now)).status,'SENT');
    await assert.rejects(policy.deliver(id,{...dto,text:'different'},now),/Ключ/);
    assert.equal(sends.filter(x=>x.user===f.externalUserId).length,1);
  });
  await t.test('unknown result, permanent MAX rejection and stale SENDING never blindly retry', async () => {
    const f = await fixture(); let calls=0;
    const broken = new OwnerNotificationService(gateway,{sendMessage:async()=>{ calls++;throw new Error('lost transport'); }}), id=randomUUID();
    assert.equal((await broken.deliver(id,input(f),now)).status,'UNKNOWN'); assert.equal((await broken.deliver(id,input(f),now)).status,'UNKNOWN'); assert.equal(calls,1);
    const rejected = new OwnerNotificationService(gateway,{sendMessage:async()=>{calls++;throw Object.assign(new Error('rejected'),{maxRejected:true});}}), other=randomUUID();
    assert.equal((await rejected.deliver(other,input(f),now)).status,'REJECTED'); await rejected.deliver(other,input(f),now); assert.equal(calls,2);
    await gateway.ownerNotificationDelivery.update({where:{id},data:{status:'SENDING',attemptedAt:new Date(now.getTime()-120000)}});
    assert.equal((await broken.deliver(id,input(f),now)).status,'UNKNOWN'); assert.equal(calls,2);
  });
  await t.test('rescheduling cancels old jobs atomically; unchanged edits preserve current reminder', async () => {
    const f=await fixture(), {appointment,actor}=await makeAppointment(f);
    await core.observeOwner((await policy.subscribers()).find(x=>x.ownerId===f.owner.id),now);
    const original=(await rows(f)).filter(x=>x.status==='QUEUED'); assert.equal(original.length,2);
    await appointments.updateAppointment(appointment.id,{startsAt:appointment.startsAt.toISOString(),endsAt:appointment.endsAt.toISOString(),comment:'Synthetic note'},actor.id);
    assert.equal((await rows(f)).filter(x=>x.status==='QUEUED').length,2);
    await appointments.updateAppointment(appointment.id,{startsAt:new Date(now.getTime()+22*3600000).toISOString(),endsAt:new Date(now.getTime()+23*3600000).toISOString()},actor.id);
    for(const row of original) assert.equal((await db.notificationOutbox.findUnique({where:{id:row.id}})).status,'CANCELLED');
    await core.observeOwner((await policy.subscribers()).find(x=>x.ownerId===f.owner.id),now);
    const updated=(await rows(f)).filter(x=>x.status==='QUEUED'); assert.equal(updated.length,2);
    assert.ok(updated.every(x=>x.metadata.reminder.fingerprint!==original[0].metadata.reminder.fingerprint));
    for(const row of updated) await core.dispatch(row.id,now);
    assert.equal(sends.filter(x=>x.user===f.externalUserId).length,2);
  });
  await t.test('cancellation removes appointment reminders and creates one generic cancellation', async () => {
    const f=await fixture(), {appointment,actor}=await makeAppointment(f), subscriber=(await policy.subscribers()).find(x=>x.ownerId===f.owner.id);
    await core.observeOwner(subscriber,now); await appointments.cancelAppointment(appointment.id,actor.id);
    assert.equal((await rows(f)).filter(x=>x.status==='QUEUED').length,0);
    await core.observeOwner(subscriber,now); const queued=(await rows(f)).filter(x=>x.status==='QUEUED'); assert.equal(queued.length,1); assert.match(queued[0].body,/отменена/);
    await core.dispatch(queued[0].id,now); assert.equal(sends.filter(x=>x.user===f.externalUserId).length,1);
  });
  await t.test('CRM response loss uses same gateway ID on recovery', async () => {
    const f=await fixture(), {appointment}=await makeAppointment(f);
    await preference(f,{appointmentChanges:false}); await core.observeOwner((await policy.subscribers()).find(x=>x.ownerId===f.owner.id),now);
    const row=(await rows(f)).find(x=>x.status==='QUEUED'), route=core.gateway; let first=true;
    core.gateway=async(path,body)=>{ const result=await route(path,body);if(first){first=false;throw new Error('lost ACK');}return result; };
    await core.dispatch(row.id,now); assert.equal((await db.notificationOutbox.findUnique({where:{id:row.id}})).status,'QUEUED');
    // A receipt lost until after the reminder expires must still resolve as SENT, never resend.
    core.gateway=route; await core.dispatch(row.id,new Date(now.getTime()+25*3600000));
    assert.equal((await db.notificationOutbox.findUnique({where:{id:row.id}})).status,'SENT'); assert.equal(sends.filter(x=>x.user===f.externalUserId).length,1);
    assert.ok(appointment.id);
  });
  await t.test('only explicit revisit tasks are queued; completion or changed date invalidates them', async () => {
    const f=await fixture();
    const task=await db.task.create({data:{ownerId:f.owner.id,animalId:f.animal.id,taskType:'revisit',title:'Synthetic repeat visit',dueAt:new Date(now.getTime()+20*3600000)}});
    await db.task.create({data:{ownerId:f.owner.id,animalId:f.animal.id,taskType:'follow_up',title:'Private task',dueAt:new Date(now.getTime()+20*3600000)}});
    await core.observeOwner((await policy.subscribers()).find(x=>x.ownerId===f.owner.id),now);
    const queued=(await rows(f)).filter(x=>x.status==='QUEUED'); assert.equal(queued.length,1);
    await db.task.update({where:{id:task.id},data:{status:'DONE'}}); await core.dispatch(queued[0].id,now);
    assert.equal((await db.notificationOutbox.findUnique({where:{id:queued[0].id}})).status,'CANCELLED'); assert.equal(sends.filter(x=>x.user===f.externalUserId).length,0);
  });
  await t.test('vaccinations use confirmed current CRM dates; superseded or disabled reminders are cancelled', async () => {
    const f=await fixture(), due=new Date(now.getTime()+86400000);
    const old=await db.vaccination.create({data:{animalId:f.animal.id,title:'Synthetic vaccine',vaccinatedAt:new Date(now.getTime()-86400000),expiresAt:due,ownerReminderEnabled:true}});
    const newest=await db.vaccination.create({data:{animalId:f.animal.id,title:'Synthetic vaccine',vaccinatedAt:now,expiresAt:due,ownerReminderEnabled:true}});
    const create=v=>db.notificationOutbox.create({data:{ownerId:f.owner.id,animalId:f.animal.id,channel:'MESSENGER',recipient:`owner:${f.owner.id}`,body:'private vaccine detail',scheduledAt:now,metadata:{source:'vaccination',vaccinationId:v.id,dueDate:due.toISOString().slice(0,10)}}});
    const a=await create(old),b=await create(newest); await core.dispatch(a.id,now); await core.dispatch(b.id,now);
    assert.equal((await db.notificationOutbox.findUnique({where:{id:a.id}})).status,'CANCELLED'); assert.equal((await db.notificationOutbox.findUnique({where:{id:b.id}})).status,'SENT');
    const sent=sends.filter(x=>x.user===f.externalUserId); assert.equal(sent.length,1); assert.ok(!sent[0].text.includes('Synthetic vaccine')&&!sent[0].text.includes('private vaccine'));
    const c=await create(newest); await db.vaccination.update({where:{id:newest.id},data:{expiresAt:new Date(due.getTime()+86400000)}}); await core.dispatch(c.id,now);
    assert.equal((await db.notificationOutbox.findUnique({where:{id:c.id}})).status,'CANCELLED');
  });
  await t.test('queued opt-out never sends; unknown delivery blocks manual retry', async () => {
    const f=await fixture(); await makeAppointment(f); await preference(f,{appointmentChanges:false});
    await core.observeOwner((await policy.subscribers()).find(x=>x.ownerId===f.owner.id),now); const row=(await rows(f)).find(x=>x.status==='QUEUED');
    await policy.unsubscribe(f.token); await core.dispatch(row.id,now);
    assert.equal((await db.notificationOutbox.findUnique({where:{id:row.id}})).status,'CANCELLED'); assert.equal(sends.filter(x=>x.user===f.externalUserId).length,0);
    await db.notificationOutbox.update({where:{id:row.id},data:{status:'FAILED',metadata:{deliveryUnknown:true}}});
    await assert.rejects(new NotificationsService(db,audit,{},{}).retryOutbox(row.id,'synthetic'),/дубликат/);
  });
  await t.test('blocked portal access suppresses queued reminders even with a still linked messenger', async () => {
    const f=await fixture(); await makeAppointment(f); await preference(f,{appointmentChanges:false});
    await core.observeOwner((await policy.subscribers()).find(x=>x.ownerId===f.owner.id),now);
    const row=(await rows(f)).find(x=>x.status==='QUEUED');
    await db.clientPortalAccess.update({where:{ownerId:f.owner.id},data:{status:'BLOCKED'}});
    await core.dispatch(row.id,now);
    assert.equal((await db.notificationOutbox.findUnique({where:{id:row.id}})).status,'CANCELLED');
    assert.equal(sends.filter(x=>x.user===f.externalUserId).length,0);
  });
  await t.test('disabled pilot jobs cannot starve the existing notification queue', async () => {
    const f=await fixture();
    for(let i=0;i<25;i++) await db.notificationOutbox.create({data:{ownerId:f.owner.id,channel:'MESSENGER',recipient:`owner:${f.owner.id}`,body:'Dormant synthetic pilot job',scheduledAt:now,dedupeKey:`assistant-qa-disabled:${randomUUID()}`,metadata:{source:'assistant-reminder'}}});
    const legacy=await db.notificationOutbox.create({data:{ownerId:f.owner.id,channel:'MESSENGER',recipient:`owner:${f.owner.id}`,body:'Synthetic legacy portal message',scheduledAt:now,metadata:{delivery:{mode:'EXPLICIT',messengerChannels:[]}}}});
    // Scope the dispatcher to this test's owner while retaining its real Prisma query/mutations.
    const scoped=new Proxy(db,{get(target,key){if(key!=='notificationOutbox')return Reflect.get(target,key);return new Proxy(target.notificationOutbox,{get(delegate,property){return property==='findMany'?args=>delegate.findMany({...args,where:{AND:[args.where,{ownerId:f.owner.id}]}}):Reflect.get(delegate,property);}});}});
    const dispatcher=new NotificationDispatcherService(scoped,{syncSnapshot:async()=> 'synced'},{enabled:()=>false,handles:()=>false});
    await dispatcher.tick();
    assert.equal((await db.notificationOutbox.findUnique({where:{id:legacy.id}})).status,'SENT');
    assert.equal((await rows(f)).filter(x=>x.status==='QUEUED').length,25);
  });
});
