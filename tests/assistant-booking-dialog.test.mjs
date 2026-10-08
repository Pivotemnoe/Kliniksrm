import assert from 'node:assert/strict';
import test from 'node:test';
import { selectBookingDate, matchesBookingDate, selectBookingService } from '../apps/api/dist/modules/online-requests/assistant-booking-selection.js';
import { nextBookingDraft, fallbackBookingHints } from '../apps/owner-gateway/dist/clinic-booking-dialog.js';
const now = new Date('2026-10-08T20:30:00Z'); // 23:30 Moscow, 00:30 Samara
test('booking calendar follows office date, exact dates, weekdays and bounded time windows', () => {
  for (const [text, date] of [['сегодня','2026-10-08'],['завтра','2026-10-09'],['послезавтра','2026-10-10'],['в пятницу','2026-10-09'],['12.10','2026-10-12'],['12 октября','2026-10-12'],['2026-10-12','2026-10-12']]) {
    assert.deepEqual(selectBookingDate(text, undefined, now, 'Europe/Moscow'), { state: 'MATCHED', date });
  }
  assert.equal(selectBookingDate('сегодня', undefined, now, 'Europe/Samara').date, '2026-10-09');
  assert.equal(selectBookingDate('завтра', undefined, now, 'Europe/Samara').date, '2026-10-10');
  const selection = selectBookingDate('завтра после 15:00', undefined, now, 'Europe/Moscow');
  assert.equal(matchesBookingDate(new Date('2026-10-09T12:00:00Z'), 'Europe/Moscow', selection), true);
  assert.equal(matchesBookingDate(new Date('2026-10-09T11:45:00Z'), 'Europe/Moscow', selection), false);
  assert.equal(matchesBookingDate(new Date('2026-10-10T12:00:00Z'), 'Europe/Moscow', selection), false);
  assert.equal(matchesBookingDate(new Date('2026-10-09T06:00:00Z'), 'Europe/Moscow', selectBookingDate('завтра утром', undefined, now, 'Europe/Moscow')), true);
  assert.equal(matchesBookingDate(new Date('2026-10-09T12:15:00Z'), 'Europe/Moscow', selectBookingDate('завтра в 15:00', undefined, now, 'Europe/Moscow')), false);
  assert.equal(selectBookingDate('неясно', '2026-10-11', now, 'Europe/Moscow').date, '2026-10-11');
});
test('ambiguous, past and impossible dates do not silently choose a different day', () => {
  for (const text of ['на следующей неделе', 'когда-нибудь', 'в пять', 'завтра в 5', 'завтра в 24:00', 'завтра до 12:90', '31.11.2026', '07.10.2026', 'завтра или послезавтра', '2027-01-01']) {
    assert.equal(selectBookingDate(text, undefined, now, 'Europe/Moscow').state, 'CLARIFY', text);
  }
  assert.equal(selectBookingDate(undefined, '2026-02-31', now, 'Europe/Moscow').state, 'CLARIFY');
  assert.equal(selectBookingDate('завтра утром', undefined, new Date('2026-03-08T04:30:00Z'), 'America/New_York').date, '2026-03-08');
  assert.equal(selectBookingDate('завтра', undefined, new Date('2026-12-31T20:30:00Z'), 'Europe/Moscow').date, '2027-01-01');
});
test('service matching returns only configured services and asks about ambiguity', () => {
  const services = [{ id: 'a', title: 'Первичный приём' }, { id: 'b', title: 'Повторный приём' }, { id: 'c', title: 'Вакцинация кошки' }, { id: 'd', title: 'Вакцинация собаки' }];
  assert.equal(selectBookingService(services, 'приём').state, 'CHOOSE');
  assert.equal(selectBookingService(services, 'прививка').state, 'CHOOSE');
  assert.deepEqual(selectBookingService(services, 'записать здоровую собаку на прививку').services.map(s => s.id), ['d']);
  assert.deepEqual(selectBookingService([{ id: 'e', title: 'Плановый осмотр' }], 'плановый осмотр кота').services.map(s => s.id), ['e']);
  assert.deepEqual(selectBookingService(services, 'первичного приёма').services.map(s => s.id), ['a']);
  assert.equal(selectBookingService(services, 'операция').state, 'UNAVAILABLE');
  assert.equal(selectBookingService(services, undefined, 'unknown').state, 'UNAVAILABLE');
  assert.deepEqual(selectBookingService(services, 'неясно', 'b').services.map(s => s.id), ['b']);
});
test('dialog carries the latest literal fragments, rejects invented values and extracts only booking hints', () => {
  const first = nextBookingDraft(null, 2, 'Хочу вакцинацию завтра', { serviceQuery: 'вакцинацию', preferredTimeText: 'завтра' });
  const next = nextBookingDraft(first, 4, 'лучше послезавтра', { serviceQuery: null, preferredTimeText: 'послезавтра' });
  assert.deepEqual(next, { revision: 4, serviceQuery: 'вакцинацию', preferredTimeText: 'послезавтра' });
  assert.equal(nextBookingDraft(next, 6, 'завтра', { serviceQuery: 'чужая услуга', preferredTimeText: 'через год' }).serviceQuery, 'вакцинацию');
  assert.deepEqual(fallbackBookingHints('Хочу первичный приём завтра после 15:00'), { serviceQuery: 'первичный приём', preferredTimeText: 'завтра после 15:00' });
});
