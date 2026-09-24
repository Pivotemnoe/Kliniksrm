import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { resolveVaccinationDues, selectCurrentVaccinations } = require('../apps/api/dist/modules/animals/vaccination-due.js');
const { AnimalsService } = require('../apps/api/dist/modules/animals/animals.service.js');
const { TasksService } = require('../apps/api/dist/modules/tasks/tasks.service.js');
const now = new Date('2026-09-24T09:00:00Z');
const row = (id, title, date, due, status) => ({ id, title, animalId: 'a', animal: { id: 'a' }, vaccinatedAt: new Date(date), createdAt: new Date(date), expiresAt: due ? new Date(due) : null, revaccinationTask: status ? { status, comment: 'Прежний комментарий' } : null });

test('late and early revaccination replace overdue aliases from the reported cases', () => {
 for (const date of ['2026-09-23', '2026-09-17']) {
  const items = [row('old1','Мультифел','2026-09-01','2026-09-22'), row('old2','рабифел','2026-09-01','2026-09-22'),
   row('new1','Мультифел 4 (1 доза)',date,'2027-09-23'), row('new2','Рабифел (1 доза)',date,'2027-09-23')];
  assert.deepEqual(resolveVaccinationDues(items, now).overdue, []);
  assert.deepEqual(selectCurrentVaccinations(items).map(x => x.id), ['new1','new2']);
 }
});
test('latest administration wins even with shorter or absent next date; unrelated vaccine and other animal remain', () => {
 const items = [row('old','Рабифел','2026-08-01','2027-08-01'), row('new','Рабифел (1 доза)','2026-09-01',null),
  row('viral','Мультифел 4','2026-08-01','2026-09-01'), {...row('other','Рабифел','2026-08-01','2026-09-01'), animal:{ id:'b' }}];
 assert.deepEqual(resolveVaccinationDues(items, now).overdue.map(x => x.id).sort(), ['other','viral']);
 items[1].expiresAt = new Date('2026-09-20');
 assert.ok(resolveVaccinationDues(items, now).overdue.some(x => x.id === 'new'));
});
test('completed, cancelled and archived task suppress current reminder without resurrecting earlier doses', () => {
 for (const status of ['DONE','CANCELLED','ARCHIVED']) {
  assert.deepEqual(resolveVaccinationDues([row('old','Рабифел','2026-08-01','2026-08-22'),row('new','Рабифел','2026-09-01','2026-09-22',status)], now).overdue, []);
 }
 assert.equal(resolveVaccinationDues([row('open','Рабифел','2026-09-01','2026-09-22','OPEN')],now).overdue.length,1);
});
function fixture(rows) {
 const writes = [], audits = [];
 const tx = { vaccination: { findMany: async query => rows.filter(x => query.where.id.in.includes(x.id) && x.animalId === query.where.animalId) },
  task: { upsert: async arg => { writes.push(['upsert', arg]); }, updateMany: async arg => { writes.push(['task',arg]); } },
  notificationOutbox: { updateMany: async arg => { writes.push(['outbox',arg]); } } };
 const prisma = { animal: { findUnique: async () => ({ id:'a', ownerId:'owner', archivedAt:null }) }, $transaction: async fn => fn(tx) };
 return { service: new AnimalsService(prisma,{ log: async arg => audits.push(arg) },{}, {}, {}), writes, audits, tx };
}
test('dismissal affects only requested animal reminders; no vaccination, bill, stock writes', async () => {
 const {service,writes,audits} = fixture([row('v1','Рабифел','2026-08-01','2026-09-01','OPEN')]);
 assert.deepEqual(await service.dismissVaccinationReminders('a',{vaccinationIds:['v1'],reason:'Отказались'},'doctor'),{dismissed:1});
 assert.deepEqual(writes.map(x=>x[0]),['upsert','task','outbox']);
 assert.deepEqual(writes[0][1].update,{});
 assert.equal(writes[0][1].create.status,'CANCELLED');
 assert.equal(writes[1][1].where.status,'OPEN');
 assert.equal(writes[1][1].data.comment,'Прежний комментарий\nОтказались');
 assert.deepEqual(writes[2][1].where,{dedupeKey:{startsWith:'vaccination:v1:'},status:{in:['QUEUED','FAILED']}});
 assert.equal(audits[0].action,'vaccination.reminder.dismiss');
});
test('foreign ids and empty reasons fail before any reminder writes', async () => {
 const {service,writes} = fixture([row('v1','Рабифел','2026-08-01','2026-09-01')]);
 await assert.rejects(service.dismissVaccinationReminders('a',{vaccinationIds:['v1','foreign'],reason:'Отказались'},'doctor'));
 await assert.rejects(service.dismissVaccinationReminders('a',{vaccinationIds:['v1'],reason:' '},'doctor'));
 assert.deepEqual(writes,[]);
});
test('new vaccination closes only superseded open tasks and cancels only their unsent notifications', async () => {
 const {service,writes,tx} = fixture([]);
 tx.vaccination.findMany = async () => [row('old','Мультифел','2026-08-01','2026-09-01'),row('new','Мультифел 4 (1 доза)','2026-09-23','2027-09-23')];
 await service.closeSupersededVaccinationReminders(tx,'a');
 assert.deepEqual(writes[0][1].where,{sourceVaccinationId:{in:['old']},status:'OPEN'});
 assert.equal(writes[0][1].data.status,'DONE');
 assert.deepEqual(writes[1][1].where.OR,[{dedupeKey:{startsWith:'vaccination:old:'}}]);
});
test('task completion cancels queued reminders atomically; ordinary tasks do not touch notification queue', async () => {
 for (const sourceVaccinationId of ['v1',null]) {
  const calls=[];const saved={id:'task',status:'DONE',sourceVaccinationId};
  const tx={task:{update:async()=>saved},notificationOutbox:{updateMany:async arg=>calls.push(arg)}};
  const service=new TasksService({$transaction:async fn=>fn(tx)}, {}, {}, {});
  assert.equal(await service.saveTaskAndReminder('task',{status:'DONE'}),saved);
  assert.equal(calls.length,sourceVaccinationId?1:0);
  if(sourceVaccinationId) assert.equal(calls[0].where.dedupeKey.startsWith,'vaccination:v1:');
 }
});
