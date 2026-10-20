import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { defaultAvitoSettings } = require('../apps/api/dist/modules/avito/avito.settings.js');
const { decideAvitoReply } = require('../apps/api/dist/modules/avito/avito.policy.js');
const { avitoPricing } = require('../apps/api/dist/modules/avito/avito-availability.js');
const { clinicUrgency } = require('../apps/api/dist/modules/avito/avito-clinic-guidance.js');
const { AvitoCrmKnowledgeService } = require('../apps/api/dist/modules/avito/avito-crm-knowledge.service.js');
const phone = '+79284214542';
const printablePhone = '+7 928 421-45-42';
const address = 'Армавир, ул. Каспарова 27/2';
const workingHours = Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day => [day, { isWorking: true, is24Hours: true }]));
function setup() {
  const settings = defaultAvitoSettings();
  settings.listings = [{ id: '1', title: 'Диспансеризация', direction: 'CLINIC', enabled: true }];
  settings.nightTariff.enabled = true;
  const crm = new AvitoCrmKnowledgeService({
    clinicOffice: { findMany: async () => [{ id: 'office', name: 'Основная клиника', phone, address, timezone: 'Europe/Moscow', workingHours }] },
    service: { findMany: async () => [{ title: 'Первичный прием врача', priceType: 'FIXED', price: 600 }] },
  });
  return { settings, crm };
}
async function answer(text, { at = '2026-10-19T18:00:00Z', extra = {}, known = true } = {}) {
  const { settings, crm } = setup();
  const now = new Date(at);
  const crmAnswer = known ? await crm.answer('org', text, undefined, 'Диспансеризация', undefined, undefined, avitoPricing(settings, now)) : null;
  return decideAvitoReply({ settings, listingId: '1', text, messageId: 'source', now, clinicPhone: phone, crmAnswer, nightNoticeDelivered: true, ...extra });
}
test('the complete owner question answers admission and the mistyped address without an internal clinic name', async () => {
  const d = await answer('Я понял, что нужно взять для  приёма в клинике? Какой у вас адре?');
  assert.match(d.text, /ветпаспорт питомца/);
  assert.match(d.text, /паспорта нет, всё равно можно приехать/);
  assert.ok(d.text.includes(address));
  assert.ok(!/Основная|единственн|администратор|паспорт человека/iu.test(d.text));
  assert.equal(d.createInquiry, false);
  assert.equal(d.handoff, false);
});
test('internal office names are never copied into address, hours or phone replies, day or night', async () => {
  for (const at of ['2026-10-19T09:00:00Z', '2026-10-19T18:00:00Z']) {
    for (const text of ['Какой у вас адрес?', 'Вы работаете?', 'Ваш телефон?']) {
      const d = await answer(text, { at });
      assert.ok(!/Основная клиника|единственная клиника/iu.test(d.text), d.text);
      if (text.includes('телефон')) assert.ok(d.text.includes(printablePhone));
    }
  }
});
test('a statement about the first visit is context; the night x-ray question receives no unrelated admission FAQ', async () => {
  const { crm } = setup();
  const d = await crm.answer('org', 'Я первый раз приеду, ночью рентген работает?', undefined, undefined, undefined, [
    { kind: 'ADMISSION', text: 'Я первый раз приеду', serviceQuery: null },
    { kind: 'SERVICE', text: 'рентген работает?', serviceQuery: 'рентген' },
    { kind: 'HOURS', text: 'ночью рентген работает?', serviceQuery: 'рентген' },
  ], { note: '', administratorWorking: false });
  assert.ok(!/паспорт|Рентген в клинике есть/.test(d.text));
  assert.match(d.text, /рентген ночью уточните у дежурного врача/);
});
test('at night every unsupported route names the duty doctor and phone, with no administrator promise', async () => {
  for (const [text, extra] of [
    ['Непонятный вопрос о процедуре', {}],
    ['Как подготовить питомца к наркозу?', { intent: { action: 'MEDICAL', knowledgeId: null, serviceQuery: null } }],
    ['Соедините с администратором', {}],
    ['Вы бот?', {}],
    ['', { mediaType: 'image' }],
    ['Не звоните, только здесь', {}],
    ['Сколько стоит томография?', {}],
    ['Вы делаете томографию?', {}],
    ['Какие вакцины есть?', {}],
  ]) {
    const d = await answer(text, { extra });
    assert.ok(!/администратор|передам|передал|уточню у/iu.test(d.text), d.text);
    assert.match(d.text, /дежурн/);
    assert.ok(d.text.includes(printablePhone), d.text);
    assert.equal(d.createInquiry, false);
    assert.ok(!/Как к вам обращаться|Оставьте.*номер/.test(d.text));
  }
});
test('night clarification preserves the other known facts in a multi-question message', async () => {
  const d = await answer('Какой у вас адрес? Сколько стоит первичный прием врача? Вы делаете томографию?');
  assert.ok(d.text.includes(address));
  assert.match(d.text, /600 ₽/);
  assert.ok(!/1.?200|администратор/iu.test(d.text));
  assert.match(d.text, /20:00 до 08:00.*двойной/);
  assert.ok(d.text.includes(printablePhone));
});
test('specialist schedules explain administrator hours at night without promising a handoff or inventing a doctor shift', async () => {
  const text = 'А когда у вас работает специалист узи?';
  for (const at of ['2026-10-19T09:00:00Z', '2026-10-19T18:00:00Z']) {
    const d = await answer(text, { at });
    assert.match(d.text, /Расписание специалиста УЗИ можно уточнить у администратора с 09:00 до 19:00/);
    assert.ok(!/передам|передал|уточню|работает с 09|принимает с 09/iu.test(d.text));
    assert.equal(d.createInquiry, false);
    if (at.includes('18:00')) assert.ok(d.text.includes(printablePhone));
  }
  const { crm, settings } = setup();
  settings.administratorSchedule.opensAt = '10:00'; settings.administratorSchedule.closesAt = '18:00';
  const contextual = await crm.answer('org', 'А в какие дни он принимает?', undefined, undefined, undefined, [{ kind: 'HOURS', text: 'А в какие дни он принимает?', serviceQuery: 'специалист узи' }], avitoPricing(settings, new Date('2026-10-19T18:00:00Z')));
  assert.match(contextual.text, /специалиста УЗИ.*10:00 до 18:00/);
});
test('an administrator-hours explanation cannot authorize an extra night handoff promise', async () => {
  const d = await answer('Когда принимает специалист УЗИ?', { extra: { crmAnswer: { text: 'Расписание уточнит администратор с 09:00 до 19:00. Передам ему ваш вопрос.', reason: 'CRM_SPECIALIST_SCHEDULE', handoff: false, administratorHoursExplained: true } } });
  assert.ok(!/передам|администратор/iu.test(d.text));
  assert.ok(d.text.includes(printablePhone));
});
test('old editable administrator FAQs cannot bypass the night rule', async () => {
  const { settings } = setup();
  settings.profiles[0].knowledge = [{ id: 'parking', title: 'Парковка', keywords: ['парковка'], answer: 'Уточню вопрос у администратора Сергея.' }];
  const d = await answer('Есть парковка?', { extra: { settings }, known: false });
  assert.ok(!/администратор|Сергей|Уточню/iu.test(d.text));
  assert.ok(d.text.includes(printablePhone));
});
test('vomiting, diarrhea and injuries immediately route to the clinic without an intake form or model dependency', async () => {
  for (const text of ['Кошку рвёт', 'У собаки рвота, сколько стоит прием?', 'У кота понос', 'У собаки диарея', 'У кошки травма лапы', 'Собаку сбила машина', 'Кот не дышит']) {
    for (const at of ['2026-10-19T09:00:00Z', '2026-10-19T18:00:00Z']) {
      const d = await answer(text, { at, extra: { contact: { collecting: true, name: 'Анна', phone: '+79001112233', callbackAt: at, callbackMessageId: 'old' } } });
      assert.equal(d.reason, 'URGENT', text);
      assert.equal(d.createInquiry, false);
      assert.match(d.text, /Приезжайте в клинику/);
      assert.ok(d.text.includes(printablePhone));
      assert.ok(!/администратор|Оставьте|Как к вам|дозиров|дайте|заявку|600/iu.test(d.text));
    }
  }
});
test('negated symptoms and old history do not trigger a new urgent visit', () => {
  for (const text of ['Рвоты нет', 'Нет рвоты и поноса', 'Рвоты и поноса нет', 'Рвота была год назад', 'Травмы нет']) assert.equal(clinicUrgency(text), false, text);
  for (const text of ['Рвоты нет, но понос', 'Нет поноса, но кошку рвёт', 'Год назад была травма, сейчас снова рвота']) assert.equal(clinicUrgency(text), true, text);
});
test('a requested night callback is saved for working hours without promising an administrator now', async () => {
  const d = await answer('Хочу записаться, меня зовут Анна, +7 900 111-22-33');
  assert.equal(d.createInquiry, true);
  assert.match(d.text, /Заявку сохранил.*рабочее время, с 09:00 до 19:00/s);
  assert.ok(!/администратор|разреш|согласи/iu.test(d.text));
});
