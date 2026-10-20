import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { AvitoCrmKnowledgeService, vaccineAnswer } = require('../apps/api/dist/modules/avito/avito-crm-knowledge.service.js');
const tariff = (title, priceType, price, minimumPrice = null, maximumPrice = null) => ({ title, priceType, price, minimumPrice, maximumPrice });
const plain = text => text.replace(/\s/g, ' ');

test('live CRM tariffs support fixed and range prices; zero, unknown and ambiguous tariffs never promise an unsupported price', async () => {
  let rows = [tariff('УЗИ брюшной полости', 'FIXED', '1500'), tariff('УЗИ сердца', 'FIXED', '2000')]; let selection;
  const service = new AvitoCrmKnowledgeService({ service: { findMany: async query => { selection = query; return rows; } } });
  assert.equal((await service.answer('org', 'Сколько стоит УЗИ?')).reason, 'CRM_PRICE_AMBIGUOUS');
  assert.match(plain((await service.answer('org', 'Сколько стоит УЗИ брюшной полости?')).text), /1 500 ₽/);
  rows[0].price = '1700'; assert.match(plain((await service.answer('org', 'Цена УЗИ брюшной полости')).text), /1 700 ₽/);
  rows = [tariff('Обработка ран', 'FLOATING', 0, 300, 900)]; assert.match((await service.answer('org', 'Цена обработки ран')).text, /от 300 до 900/);
  rows = [tariff('Консультация', 'FIXED', 0)]; assert.equal((await service.answer('org', 'Цена консультации')).handoff, true); assert.ok(!(await service.answer('org', 'Цена консультации')).text.includes('0 ₽'));
  rows = [tariff('Консультация', 'UNKNOWN', 500)]; assert.equal((await service.answer('org', 'Цена консультации')).handoff, true);
  assert.deepEqual(selection.where, { isActive: true }); assert.equal('linkedProducts' in selection.select, false); assert.equal('billItems' in selection.select, false);
});
test('CRM hours never use the editor defaults and do not imply a doctor appointment', async () => {
  let query;
  const service = new AvitoCrmKnowledgeService({ clinicOffice: { findMany: async q => { query = q; return [{ name: 'Тестовый филиал', timezone: 'Europe/Moscow', address: 'Тестовый адрес', phone: 'Тестовый телефон', workingHours: { monday: { isWorking: true, opensAt: '08:30', closesAt: '18:00' }, tuesday: { isWorking: false }, wednesday: { isWorking: true, is24Hours: true } } }]; } } });
  const reply = await service.answer('org-1', 'До скольки вы работаете?');
  assert.match(reply.text, /Пн — 08:30–18:00/); assert.match(reply.text, /Вт — выходной/); assert.match(reply.text, /Ср — круглосуточно/); assert.match(reply.text, /Чт — не указан/); assert.ok(!reply.text.includes('09:00')); assert.match(reply.text, /Возможность и время приёма уточнит администратор/); assert.ok(!/CRM|API|промпт/.test(reply.text));
  assert.deepEqual(query.where, { organizationId: 'org-1' }); assert.equal('employee' in query.select, false);
  assert.match((await service.answer('org-1', 'Ваш телефон')).text, /Тестовый телефон/);
});
test('CRM read failure and an absent service escalate without stale copied facts', async () => {
  const failed = new AvitoCrmKnowledgeService({ service: { findMany: async () => { throw Error('database unavailable'); } } });
  assert.equal((await failed.answer('org', 'Цена УЗИ')).reason, 'CRM_UNAVAILABLE');
  const empty = new AvitoCrmKnowledgeService({ service: { findMany: async () => [] } });
  assert.equal((await empty.answer('org', 'Цена УЗИ')).reason, 'CRM_PRICE_NOT_FOUND');
  assert.equal(await empty.answer('org', 'Здравствуйте'), null);
});
test('a bare price question uses its service card, while a named different service takes priority', async () => {
  const service = new AvitoCrmKnowledgeService({ service: { findMany: async () => [tariff('Вакцинация', 'FIXED', 700), tariff('Рентген', 'FIXED', 900)] } });
  const fromCard = await service.answer('org', 'Сколько стоит?', undefined, 'Вакцинация'); assert.match(fromCard.text, /«Вакцинация» — 700 ₽/); assert.ok(!/CRM|API/.test(fromCard.text));
  const withGreeting = await service.answer('org', 'Здравствуйте, подскажите, сколько стоит?', undefined, 'Вакцинация'); assert.match(withGreeting.text, /«Вакцинация» — 700 ₽/);
  const explicit = await service.answer('org', 'Добрый день, сколько стоит Рентген?', undefined, 'Вакцинация'); assert.match(explicit.text, /«Рентген» — 900 ₽/);
  assert.equal((await service.answer('org', 'Сколько стоит?')).reason, 'CRM_PRICE_CLARIFY');
  assert.equal(service.withListingContext('До скольки вы работаете?', 'Вакцинация'), 'До скольки вы работаете?');
});
test('vaccine availability trusts the CRM balance of the selected clinic office without querying or asking about expiry', async () => {
  let query;
  const service = new AvitoCrmKnowledgeService({ clinicOffice: { findMany: async () => [{ id: 'office-a' }] }, product: { findMany: async q => {
    query = q; return [
      { id: 'a', title: 'Тестовая вакцина Альфа', batches: [{ id: 'batch-a' }] },
      { id: 'b', title: 'Тестовая вакцина Бета', batches: [{ id: 'batch-b' }] },
      { id: 'c', title: 'Тестовая вакцина Гамма', batches: [] },
    ];
  } } });
  const answer = await service.answer('org-a', 'Какие вакцины есть?');
  assert.equal(answer.reason, 'CRM_VACCINES'); assert.match(answer.text, /Альфа/); assert.match(answer.text, /Бета/); assert.ok(!/Гамма|срок|годност|остаток|закупоч/i.test(answer.text));
  assert.deepEqual(query.where.category, { title: { equals: 'Вакцины', mode: 'insensitive' } });
  assert.equal(query.select.batches.where.warehouse.officeId, 'office-a'); assert.equal(query.select.batches.where.rest.gt, 0);
  assert.deepEqual(Object.keys(query.select.batches.where).sort(), ['rest', 'warehouse']);
  assert.deepEqual(Object.keys(query.select).sort(), ['batches', 'id', 'title']); assert.deepEqual(query.select.batches.select, { id: true });
  const rows = await service.vaccineAvailability('org-a');
  assert.equal(vaccineAnswer('Какие вакцины есть?', rows).handoff, false);
  assert.equal(vaccineAnswer('Есть Бета?', rows).handoff, false);
  assert.equal(vaccineAnswer('Есть Гамма?', rows).handoff, true);
  assert.equal(vaccineAnswer('Есть Неизвестная?', rows).handoff, true);
  assert.equal(vaccineAnswer('Какие вакцины есть?', null).handoff, true);
  assert.equal(service.withListingContext('Есть Альфа?', 'Вакцинация'), 'Наличие вакцин: Есть Альфа?');
  assert.equal(service.withListingContext('Сколько стоит?', 'Вакцинация'), 'Стоимость Вакцинация');
});
test('a clinic working around the clock has a short human-readable schedule', async () => {
  const workingHours = Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day => [day, { isWorking: true, is24Hours: true }]));
  const service = new AvitoCrmKnowledgeService({ clinicOffice: { findMany: async () => [{ name: 'Клиника', timezone: 'Europe/Moscow', workingHours }] } });
  const answer = await service.answer('org', 'До скольки вы работаете?'); assert.match(answer.text, /круглосуточно, ежедневно/); assert.ok(!answer.text.includes('Europe/Moscow')); assert.ok(answer.text.length < 200);
});

test('the complete owner message answers vaccination, x-ray and arrival without inventing a vaccine name', async () => {
  const { crmQuestions } = require('../apps/api/dist/modules/avito/avito-crm-knowledge.service.js');
  const text = 'Вы делаете вакцинацию? У вас есть рентген? Сейчас можно приехать, вы работаете?';
  const workingHours = Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day => [day, { isWorking: true, is24Hours: true }]));
  let stockReads = 0;
  const service = new AvitoCrmKnowledgeService({
    service: { findMany: async () => [tariff('Вакцинация', 'FIXED', 700), tariff('Рентген', 'FIXED', 900)] },
    clinicOffice: { findMany: async () => [{ name: 'Клиника', timezone: 'Europe/Moscow', workingHours }] },
    product: { findMany: async () => { stockReads++; throw Error('No stock question was asked'); } },
  });
  assert.deepEqual(crmQuestions(text).map(question => question.kind), ['SERVICE', 'SERVICE', 'HOURS']);
  const answer = await service.answer('org', text, undefined, 'Диспансеризация');
  assert.equal(answer.reason, 'CRM_MULTIPLE_QUESTIONS');
  assert.match(answer.text, /Вакцинацию проводим/);
  assert.match(answer.text, /Рентген в клинике есть/);
  assert.match(answer.text, /Клиника работает круглосуточно/);
  assert.equal(answer.handoff, false); assert.equal(answer.reconfirmNightContact, true); assert.equal(stockReads, 0);
  assert.equal(service.withListingContext('У вас есть рентген?', 'Вакцинация'), 'У вас есть рентген?');
});

test('separate questions retain each CRM fact and an unavailable service does not erase the others', async () => {
  const service = new AvitoCrmKnowledgeService({
    service: { findMany: async () => [tariff('Рентген', 'FIXED', 900)] },
    clinicOffice: { findMany: async () => [{ name: 'Клиника', timezone: 'Europe/Moscow', address: 'Тестовый адрес', phone: '+7 900 000-00-01', workingHours: {} }] },
  });
  const answer = await service.answer('org', 'Какой у вас адрес? Сколько стоит рентген? Вы делаете томографию?');
  assert.match(answer.text, /Тестовый адрес/); assert.match(answer.text, /900 ₽/); assert.match(answer.text, /Возможность этой услуги уточнит администратор/); assert.equal(answer.handoff, true);
  const planned = await service.answer('org', 'Можно узнать, рентген сколько у вас выходит и где вы находитесь?', undefined, undefined, undefined, [
    { kind: 'PRICE', text: 'рентген сколько у вас выходит', serviceQuery: 'рентген' },
    { kind: 'ADDRESS', text: 'где вы находитесь', serviceQuery: null },
  ]);
  assert.match(planned.text, /900 ₽/); assert.match(planned.text, /Тестовый адрес/);
});
test('a courteous general appointment price lists primary and repeat visits with an uncalculated night tariff notice and no unrelated procedure', async () => {
  const service = new AvitoCrmKnowledgeService({ service: { findMany: async () => [tariff('Первичный прием врача','FIXED',600),tariff('Повторный приём врача','FIXED',450),tariff('Удаление зуба на приеме','FIXED',575)] } });
  const reply = await service.answer('org','Спасибо, сколько стоит прием?',undefined,'Диспансеризация',undefined,undefined,{note:'С 20:00 до 08:00 действует двойной ночной тариф.'});
  assert.match(plain(reply.text),/Первичный прием врача.*600 ₽/); assert.match(reply.text,/Повторный приём врача.*450 ₽/); assert.ok(!reply.text.includes('зуба')); assert.match(reply.text,/двойной ночной тариф/); assert.equal(reply.handoff,false);
  const range = new AvitoCrmKnowledgeService({service:{findMany:async()=>[tariff('Обработка ран','FLOATING',0,300,900)]}});
  assert.match(plain((await range.answer('org','Цена обработки ран',undefined,undefined,undefined,undefined,{note:''})).text),/от 300 до 900 ₽/);
});
test('night x-ray hours are checked with the duty doctor instead of claiming that the x-ray follows general clinic hours', async () => {
  const { decideAvitoReply } = require('../apps/api/dist/modules/avito/avito.policy.js');
  const { defaultAvitoSettings } = require('../apps/api/dist/modules/avito/avito.settings.js');
  const service = new AvitoCrmKnowledgeService({ clinicOffice: { findMany: async () => [{ id:'office',name:'Клиника',phone:'+79284214542' }] } });
  const text = 'Я первый раз приеду, ночью рентген работает?';
  const answer = await service.answer('org', text, undefined, 'Диспансеризация', undefined, undefined, {note:'С 20:00 до 08:00 действует двойной ночной тариф.',administratorWorking:false});
  assert.match(answer.text,/рентген ночью уточните у дежурного врача/); assert.match(answer.text,/\+7 928 421-45-42/); assert.ok(!/администратор|круглосуточно/.test(answer.text)); assert.equal(answer.handoff,false);
  const s=defaultAvitoSettings();s.listings=[{id:'1',title:'Диспансеризация',direction:'CLINIC',enabled:true}];
  const reply=decideAvitoReply({settings:s,listingId:'1',text,messageId:'night-xray',now:new Date('2026-10-19T18:00:00Z'),clinicPhone:'+79284214542',crmAnswer:answer,nightNoticeDelivered:true});
  assert.match(reply.text,/дежурного врача/);assert.ok(!/администратор/.test(reply.text));
});
