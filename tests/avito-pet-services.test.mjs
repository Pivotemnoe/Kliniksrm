import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { defaultAvitoSettings } = require('../apps/api/dist/modules/avito/avito.settings.js');
const { decideAvitoReply } = require('../apps/api/dist/modules/avito/avito.policy.js');
const { loadPetServiceContext } = require('../apps/api/dist/modules/avito/avito-pet-services.js');
const settings = defaultAvitoSettings();
settings.profiles.forEach(p => { p.enabled = true; });
settings.listings = ['CLINIC', 'GROOMING', 'HOTEL'].map((direction, n) => ({ id: String(n + 1), title: direction, direction, enabled: true }));
const grooming = { direction: 'GROOMING', available: true, selfBookingEnabled: false, siteUrl: 'https://pet.temichevvet.ru/', address: 'Адрес салона' };
const hotel = { direction: 'HOTEL', available: true, selfBookingEnabled: true, siteUrl: 'https://pet.temichevvet.ru/pet-hotel/', address: null, hotel: { minimumDays: 2, maximumDogWeightKg: 10, walkRate: 150, checkInFrom: '09:00', checkInTo: '18:00', catRates: [700], dogRates: [800, 900] } };
const reply = (text, context = grooming, extra = {}) => decideAvitoReply({ settings, listingId: context.direction === 'HOTEL' ? '3' : '2', text, messageId: 'incoming', petService: context, now: new Date('2026-10-21T21:00:00Z'), ...extra });

test('a grooming booking request names the closed schedule and the grooming site without collecting a name or phone', () => {
  const d = reply('Хочу записаться на стрижку');
  assert.equal(d.reason, 'PET_SERVICE_INFO'); assert.equal(d.direction, 'GROOMING');
  assert.match(d.text, /пока закрыта/); assert.match(d.text, /https:\/\/pet.temichevvet.ru\//);
  assert.equal(d.contact.collecting, undefined); assert.equal(d.createInquiry, false); assert.equal(d.handoff, false);
  assert.doesNotMatch(d.text, /дежурн|ночной тариф|Как к вам обращаться|вы записаны/);
});
test('hotel prices, conditions and site handoff stay together without creating a confirmed reservation in Avito', () => {
  const d = reply('Сколько стоят кошка и собака, какие условия и как забронировать?', hotel);
  assert.match(d.text, /кошки — 700 ₽/); assert.match(d.text, /собаки — от 800 ₽/);
  assert.match(d.text, /Выгул — 150 ₽/); assert.match(d.text, /Неполные сутки считаются полными/);
  assert.match(d.text, /до 10 кг/); assert.match(d.text, /09:00 до 18:00/);
  assert.match(d.text, /pet-hotel\//); assert.match(d.text, /проверки наличия мест/);
  assert.equal(d.createInquiry, false); assert.equal(d.contact.collecting, undefined);
});
test('medical and human requests take priority over the website referral; callback confirmation names its own direction', () => {
  assert.equal(reply('Чем лечить собаку, хочу записаться?').reason, 'MEDICAL');
  assert.equal(reply('Соедините с сотрудником').reason, 'DIRECT_HUMAN_REQUEST');
  const callback = reply('Перезвоните, меня зовут Анна, +7 900 111-22-33', hotel);
  assert.equal(callback.createInquiry, true); assert.match(callback.text, /сотруднику зоогостиницы/);
  assert.doesNotMatch(callback.text, /дежурн|ночном режиме/);
  assert.equal(reply('Только здесь, без телефона').reason, 'CONTACT_DECLINED');
  assert.equal(reply('Сколько стоит?', hotel, { mode: 'HUMAN' }).text, null);
});
test('disabled or different listing directions cannot borrow pet-service prices or website replies', () => {
  const disabled = structuredClone(settings); disabled.profiles[1].enabled = false;
  assert.equal(reply('Хочу записаться', grooming, { settings: disabled }).text, null);
  const clinic = reply('Хочу записаться', hotel, { listingId: '1' });
  assert.notEqual(clinic.reason, 'PET_SERVICE_INFO'); assert.doesNotMatch(clinic.text, /pet-hotel/);
  const noSource = reply('Сколько стоит и как забронировать?', { ...hotel, available: false, selfBookingEnabled: false, hotel: undefined });
  assert.doesNotMatch(noSource.text, /700|800|свободный номер можно выбрать/);
});
test('unfinished old site-booking intake is cleared; existing explicit callback intake is preserved', () => {
  const contact = { collecting: true, reason: 'BOOKING', awaitingServiceDetails: true };
  const d = reply('Как записаться?', grooming, { contact });
  assert.equal(d.contact.collecting, undefined); assert.equal(contact.collecting, true);
  const callback = reply('Анна', grooming, { contact: { collecting: true, reason: 'CALLBACK' } });
  assert.equal(callback.reason, 'CALLBACK'); assert.match(callback.text, /номер телефона/);
  assert.match(reply('Вы бот?', hotel).text, /помощник зоогостиницы/);
});
test('a model-recognized booking in free wording goes to its website, never into callback collection', () => {
  for (const context of [grooming, hotel]) {
    const d = reply('Можно оформить визит?', context, { intent: { action: 'BOOKING' } });
    assert.equal(d.reason, 'PET_SERVICE_INFO'); assert.equal(d.petServiceBooking, true);
    assert.equal(d.createInquiry, false); assert.equal(d.contact.collecting, undefined); assert.ok(d.text.includes(context.siteUrl));
  }
});
test('the source reads only its own organization and module, and an unavailable source closes online booking', async () => {
  let selection;
  const db = { clinicModuleInstallation: { findUnique: async q => { selection = q; return { enabled: true, groomingSettings: { selfBookingEnabled: true, testClientMaxId: null }, groomingLocations: [{ address: 'Адрес салона' }], groomingRules: [] }; } } };
  const closed = await loadPetServiceContext(db, 'org-1', 'GROOMING');
  assert.deepEqual(selection.where, { organizationId_moduleKey: { organizationId: 'org-1', moduleKey: 'GROOMING' } });
  assert.equal(closed.selfBookingEnabled, false); assert.equal(closed.address, 'Адрес салона');
  assert.equal(selection.select.clinicOffice, undefined); assert.equal(selection.select.employee, undefined);
  const failed = await loadPetServiceContext({ clinicModuleInstallation: { findUnique: async () => { throw Error('offline'); } } }, 'org-1', 'HOTEL');
  assert.equal(failed.available, false); assert.equal(failed.selfBookingEnabled, false); assert.equal(failed.hotel, undefined);
});
