import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { defaultAvitoSettings, parseAvitoSettings, effectivePrompt } = require('../apps/api/dist/modules/avito/avito.settings.js');
const { decideAvitoReply } = require('../apps/api/dist/modules/avito/avito.policy.js');

function settings() {
  const s = defaultAvitoSettings();
  s.listings = ['CLINIC', 'GROOMING', 'HOTEL'].map((direction, i) => ({ id: String(i + 1), title: direction, direction, enabled: true }));
  for (const p of s.profiles) { p.enabled = true; p.knowledge = [{ id: 'price', title: 'Парковка', keywords: ['парковка'], answer: `${p.direction}: утверждённый ответ о парковке` }]; }
  return s;
}
const reply = (text, extra = {}) => decideAvitoReply({ settings: settings(), listingId: '1', messageId: 'incoming-1', now: new Date('2026-10-19T09:00:00Z'), text, ...extra });
const clinicPilot = () => parseAvitoSettings(JSON.parse(readFileSync(new URL('../docs/plans/2026-10-19-avito-clinic-pilot.json', import.meta.url), 'utf8')).settings);

test('settings have three independent profiles and reject duplicate listing ownership', () => {
  assert.equal(parseAvitoSettings(defaultAvitoSettings()).profiles.length, 3);
  const s = settings(); s.listings.push({ ...s.listings[0], direction: 'HOTEL' });
  assert.throws(() => parseAvitoSettings(s), /только одно направление/);
});
test('answers and effective prompts stay within the listing direction', () => {
  for (const [listingId, direction] of [['1', 'CLINIC'], ['2', 'GROOMING'], ['3', 'HOTEL']]) {
    const d = reply('Есть парковка?', { listingId });
    assert.equal(d.direction, direction); assert.ok(d.text.startsWith(direction));
    const other = settings().profiles.filter(p => p.direction !== direction);
    for (const p of other) assert.ok(!d.prompt.includes(p.knowledge[0].answer));
  }
});
test('unknown, disabled, and profile-less listings never get a clinic fallback', () => {
  const s = settings(); s.profiles[1].enabled = false;
  for (const listingId of [null, '999', '2']) { const d = reply('Здравствуйте', { settings: s, listingId }); assert.equal(d.direction, null); assert.equal(d.text, null); assert.equal(d.handoff, true); assert.equal(d.createInquiry, false); }
});
test('medical questions, emergencies, unsupported media and human control cannot trigger FAQ treatment', () => {
  const medical = reply('Чем лечить собаку и какую дозировку дать?'); assert.equal(medical.reason, 'MEDICAL'); assert.equal(medical.createInquiry, false); assert.ok(medical.text.includes('специалист'));
  const urgent = reply('Кот не дышит'); assert.equal(urgent.reason, 'URGENT'); assert.equal(urgent.handoff, true);
  assert.equal(reply('', { mediaType: 'image' }).reason, 'UNSUPPORTED_MEDIA');
  assert.equal(reply('Сколько стоит?', { mode: 'HUMAN' }).text, null);
});
test('a client-provided number completes a named inquiry without a second permission question', () => {
  const first = reply('Хочу записаться, меня зовут Анна, +7 900 111-22-33');
  assert.equal(first.purpose, 'SUBMITTED'); assert.equal(first.createInquiry, true); assert.equal(first.contact.callbackMessageId, 'incoming-1'); assert.ok(!/разреш|согласи/i.test(first.text));
  const onlyPhone = reply('+7 900 111-22-33'); assert.equal(onlyPhone.text, settings().templates.contactName); assert.equal(onlyPhone.contact.phone, '+79001112233');
  assert.equal(reply('Анна', { contact: onlyPhone.contact }).createInquiry, true);
  for (const text of ['Да', 'Телефон клиники +7 900 111-22-33', 'Это не мой номер +7 900 111-22-33']) assert.equal(reply(text).createInquiry, false);
});

test('a clinical question collects callback contacts without medical advice or an extra confirmation', () => {
  const first = reply('Кошка хромает, чем лечить?'); assert.equal(first.purpose, 'CONTACT'); assert.equal(first.handoff, false); assert.equal(first.needsAttention, true);
  const named = reply('Анна', { contact: first.contact }); const completed = reply('+7 900 111-22-33', { contact: named.contact });
  assert.equal(completed.createInquiry, true); assert.equal(completed.purpose, 'SUBMITTED'); assert.equal(completed.handoff, true); assert.equal(completed.reason, 'MEDICAL');
  assert.equal(reply('Кот не дышит').reason, 'URGENT'); assert.equal(reply('Соедините с сотрудником').handoff, true);
});

test('contacts are collected across messages; refusal prevents callback after a number has been provided', () => {
  const c1 = reply('Хочу записаться').contact;
  const c2 = reply('Анна', { contact: c1 }).contact;
  const c3 = reply('+7 900 111-22-33', { contact: c2 }).contact;
  assert.equal(c3.name, 'Анна'); assert.equal(c3.phone, '+79001112233');
  const denied = reply('Не звоните, только здесь', { contact: c3 });
  assert.equal(denied.reason, 'CONTACT_DECLINED'); assert.equal(denied.contact.callbackAt, undefined); assert.equal(denied.createInquiry, false);
});
test('a corrected phone points to its new source message; copied contacts alone never authorize a callback', () => {
  const d = reply('Меня зовут Анна, +7 900 111-22-34', { contact: { name: 'Анна', phone: '+79001112233', collecting: true, callbackAt: '2026-10-19T00:00:00Z', callbackMessageId: 'old' } });
  assert.equal(d.contact.phone, '+79001112234'); assert.equal(d.contact.callbackMessageId, 'incoming-1'); assert.equal(d.createInquiry, true);
  assert.equal(reply('Да', { contact: { name: 'Анна', phone: '+79001112233', collecting: true } }).createInquiry, false);
  const s = settings(); s.profiles[0].knowledge.push({ id: 'second', title: 'Другие документы', keywords: ['парковка'], answer: 'Другие тестовые сведения' });
  assert.equal(reply('Есть парковка?', { settings: s }).reason, 'AMBIGUOUS_KNOWLEDGE');
});

test('clinic prices and hours cannot come from copied FAQ text or a model decision', () => {
  const s = settings(); s.profiles[0].knowledge.push({ id: 'copied-price', title: 'Прайс', keywords: ['стоит'], answer: 'Устаревшая цена из копии' });
  const missing = reply('Сколько стоит УЗИ?', { settings: s }); assert.equal(missing.reason, 'CRM_CONTEXT_REQUIRED'); assert.ok(!missing.text.includes('копии'));
  const live = reply('Сколько стоит УЗИ?', { settings: s, crmAnswer: { text: 'Актуальная цена из CRM', reason: 'CRM_PRICE', handoff: false } }); assert.equal(live.text, 'Актуальная цена из CRM');
  const medical = reply('Рвота, сколько стоит и чем лечить?', { crmAnswer: { text: 'Цена', reason: 'CRM_PRICE', handoff: false } }); assert.equal(medical.reason, 'URGENT');
  const intent = { action: 'BOOKING', knowledgeId: null, serviceQuery: null }; const booking = reply('Планируем визит с питомцем', { intent }); assert.equal(booking.purpose, 'CONTACT'); assert.equal(booking.createInquiry, false);
});
test('directory edits preserve booking boundaries and accept old revisions without reviving a consent question', () => {
  const s = settings(); s.templates.consent = 'Архивный вопрос'; assert.equal('consent' in parseAvitoSettings(s).templates, false);
  const s2 = settings(); s2.profiles[0].knowledge[0].answer = 'Вы записаны, запись подтверждена!'; assert.throws(() => parseAvitoSettings(s2), /не должен/);
  assert.ok(effectivePrompt(settings().profiles[0]).includes('не врач'));
  const s3 = settings(); s3.profiles[0].knowledge[0].answer = 'УЗИ стоит 900 ₽'; assert.throws(() => parseAvitoSettings(s3), /берутся из CRM/);
});
test('the six clinic service cards use one common prompt; the excluded ozone bath never replies', () => {
  const s = clinicPilot(); const enabled = s.listings.filter(item => item.enabled);
  assert.equal(enabled.length, 6); assert.ok(enabled.every(item => item.direction === 'CLINIC'));
  assert.ok(!s.profiles[0].prompt.includes('Озоновая ванна'));
  for (const listing of enabled) {
    const d = reply('Здравствуйте', { settings: s, listingId: listing.id });
    assert.equal(d.text, listing.greeting); assert.ok(d.prompt.includes(s.profiles[0].prompt)); assert.ok(d.prompt.includes(listing.prompt));
    for (const other of enabled.filter(item => item.id !== listing.id)) assert.ok(!d.prompt.includes(other.prompt));
  }
  const excluded = reply('Хочу записаться, меня зовут Анна, +7 900 111-22-33', { settings: s, listingId: '4514134400' });
  assert.equal(excluded.text, null); assert.equal(excluded.handoff, true); assert.equal(excluded.createInquiry, false); assert.equal(excluded.reason, 'UNMAPPED_LISTING'); assert.equal(excluded.prompt, undefined);
});
test('a service question precedes the missing contacts once and its answer is not mistaken for an owner name', () => {
  const s = clinicPilot(); const listingId = '4962396005';
  const ask = (text, extra = {}) => reply(text, { settings: s, listingId, ...extra });
  const first = ask('Хочу записаться'); assert.equal(first.text, s.listings.find(item => item.id === listingId).intakeQuestion);
  const details = ask('Кошка', { contact: first.contact }); assert.equal(details.contact.name, undefined); assert.equal(details.contact.serviceDetails, 'Кошка'); assert.equal(details.text, s.templates.contactName);
  const name = ask('Анна', { contact: details.contact }); assert.equal(name.contact.name, 'Анна'); assert.equal(name.text, s.templates.contactPhone);
  const phone = ask('+7 900 111-22-33', { contact: name.contact }); assert.equal(phone.purpose, 'SUBMITTED'); assert.equal(phone.createInquiry, true); assert.equal(phone.contact.serviceQuestionAsked, true); assert.match(phone.contact.summary, /Уточнение по услуге: Кошка/);
  assert.equal(ask('Хочу записаться, меня зовут Анна, +7 900 111-22-33').purpose, 'SUBMITTED');
});
test('a factual question during intake is answered first without losing contacts or pretending to be human', () => {
  const s = clinicPilot(); const contact = { collecting: true, name: 'Анна', reason: 'BOOKING', serviceQuestionAsked: true };
  const d = reply('Сколько стоит?', { settings: s, listingId: '4962180462', contact, crmAnswer: { text: '«Тестовый рентген» — 700 ₽. Детали и запись уточнит администратор.', reason: 'CRM_PRICE', handoff: false } });
  assert.equal(d.purpose, 'CRM_REPLY'); assert.match(d.text, /700 ₽/); assert.equal(d.contact.name, 'Анна'); assert.equal(d.contact.collecting, true);
  const identity = reply('Вы бот?', { settings: s, listingId: '4962180462' }); assert.match(identity.text, /Да, я помощник клиники/);
  for (const value of [d.text, identity.text, s.templates.contactName, s.templates.contactPhone, s.templates.medical, s.templates.unknown, s.templates.submitted]) assert.ok(!/CRM|API|промпт/.test(value));
});
