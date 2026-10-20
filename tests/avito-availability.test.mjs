import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { defaultAvitoSettings } = require('../apps/api/dist/modules/avito/avito.settings.js');
const { decideAvitoReply } = require('../apps/api/dist/modules/avito/avito.policy.js');
const { administratorWorking, avitoPricing } = require('../apps/api/dist/modules/avito/avito-availability.js');
const { AvitoCrmKnowledgeService } = require('../apps/api/dist/modules/avito/avito-crm-knowledge.service.js');
function settings() { const s = defaultAvitoSettings(); s.listings = [{ id: '1', title: 'Вакцинация', direction: 'CLINIC', enabled: true }]; return s; }
const phone = '+7 900 000-00-01';
test('administrator availability uses the clinic timezone with inclusive 09:00 and exclusive 19:00', () => {
  const s = settings();
  for (const [at, expected] of [['2026-10-19T05:59:59Z', false], ['2026-10-19T06:00:00Z', true], ['2026-10-19T15:59:59Z', true], ['2026-10-19T16:00:00Z', false], ['2026-10-20T03:00:00Z', false]]) assert.equal(administratorWorking(s, new Date(at)), expected, at);
});
test('the double night tariff has independent inclusive 20:00 and exclusive 08:00 boundaries', () => {
  const s = settings(); s.nightTariff = { enabled: true, startsAt: '20:00', endsAt: '08:00', multiplier: 2 };
  for (const [at, multiplier] of [['2026-10-19T16:00:00Z',1],['2026-10-19T16:59:59Z',1],['2026-10-19T17:00:00Z',2],['2026-10-20T04:59:59Z',2],['2026-10-20T05:00:00Z',1],['2026-10-20T05:59:59Z',1]]) assert.equal(avitoPricing(s,new Date(at)).active,multiplier === 2,at);
  assert.match(avitoPricing(s,new Date('2026-10-19T17:00:00Z')).note,/20:00 до 08:00.*двойной ночной тариф/);
});
test('a night callback stores the inquiry and prints the actual clinic number without a permission question', () => {
  const s = settings(); const d = decideAvitoReply({ settings: s, listingId: '1', text: 'Хочу записаться, меня зовут Анна, +7 900 111-22-33', messageId: 'phone-source', now: new Date('2026-10-19T19:00:00Z'), clinicPhone: phone });
  assert.equal(d.createInquiry, true); assert.equal(d.contact.callbackMessageId, 'phone-source'); assert.match(d.text, /Заявку сохранил/); assert.match(d.text, /в рабочее время/); assert.match(d.text, /дежурит один врач/); assert.ok(d.text.includes(phone)); assert.ok(!/профил|объявлени|разреш|согласи/i.test(d.text));
  const day = decideAvitoReply({ settings: s, listingId: '1', text: 'Здравствуйте', messageId: 'greeting', now: new Date('2026-10-19T09:00:00Z'), clinicPhone: phone }); assert.ok(!day.text.includes('ночном'));
});
test('a missing or ambiguous CRM main number cannot become a profile link or an invented phone', async () => {
  const s = settings(); const offices = [{ id: 'a', name: 'Первый', phone }, { id: 'b', name: 'Второй', phone: '+7 900 000-00-02' }]; let query;
  const crm = new AvitoCrmKnowledgeService({ clinicOffice: { findMany: async q => { query = q; return offices; } } });
  assert.equal((await crm.clinicContact('org')).phone, null); assert.equal((await crm.clinicContact('org', undefined, 'a')).phone, phone); assert.equal((await crm.clinicContact('org', undefined, 'foreign-office')).phone, null); assert.deepEqual(query.where, { organizationId: 'org' });
  const missing = decideAvitoReply({ settings: s, listingId: '1', text: 'Здравствуйте', messageId: 'greeting', now: new Date('2026-10-19T19:00:00Z') }); assert.equal(missing.handoff, true); assert.ok(!/профил|объявлени|\+7/.test(missing.text));
});
test('night rendering never changes the preliminary intent or refusal used by canonical import', () => {
  for (const [text, reason] of [['Планируем визит с питомцем', 'NO_APPROVED_ANSWER'], ['Не звоните, только здесь', 'CONTACT_DECLINED']]) {
    const d = decideAvitoReply({ settings: settings(), listingId: '1', text, messageId: 'preliminary', now: new Date('2026-10-19T19:00:00Z'), skipAvailability: true }); assert.equal(d.reason, reason);
  }
});
test('an explicit arrival question repeats the duty contact even after the greeting already explained the night schedule', () => {
  const d = decideAvitoReply({ settings: settings(), listingId: '1', text: 'Сейчас можно приехать, вы работаете?', messageId: 'arrival', now: new Date('2026-10-19T17:30:00Z'), clinicPhone: phone, nightNoticeDelivered: true,
    crmAnswer: { text: 'Клиника работает круглосуточно.', reason: 'CRM_HOURS', handoff: false, reconfirmNightContact: true } });
  assert.match(d.text, /круглосуточно/); assert.match(d.text, /дежурит один врач/); assert.ok(d.text.includes(phone)); assert.equal(d.createInquiry, false);
});
