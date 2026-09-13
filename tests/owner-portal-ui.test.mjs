import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../apps/owner-gateway/public/app.js', import.meta.url), 'utf8').replace('void start();', '');
function ui() {
  const nodes = new Map();
  const context = vm.createContext({ nodes, URL, URLSearchParams, Date, Intl, navigator: {}, document: { querySelector: (selector) => { if (!nodes.has(selector)) nodes.set(selector, { addEventListener() {} }); return nodes.get(selector); } }, window: { location: { href: 'https://example.test/portal' }, setInterval() {} } });
  vm.runInContext(source, context);
  return context;
}
test('общий фильтр питомца одинаково ограничивает приёмы, файлы, анализы, стационар и счета', () => {
  const context = ui();
  context.response = { snapshot: { animals: [{ id: 'a' }, { id: 'b' }], visits: [{ id: 'va', animal: { id: 'a' }, documents: [{ id: 'signed-a' }] }, { id: 'vb', animal: { id: 'b' }, documents: [{ id: 'signed-b' }] }], files: [{ id: 'fa', animalId: 'a' }, { id: 'fb', animalId: 'b' }, { id: 'owner-file' }], laboratoryOrders: [{ id: 'la', animal: { id: 'a' } }, { id: 'lb', animal: { id: 'b' } }], hospitalStays: [{ id: 'ha', animal: { id: 'a' } }], bills: [{ id: 'ba', animal: { id: 'a' } }, { id: 'owner-bill' }] } };
  const data = vm.runInContext("selectedAnimalId = 'a'; portalData(response)", context);
  assert.deepEqual(Array.from(data.documents, (item) => item.id), ['fa', 'signed-a']);
  assert.deepEqual(Array.from(data.labs, (item) => item.id), ['la']);
  assert.deepEqual(Array.from(data.bills, (item) => item.id), ['ba']);
  assert.equal(data.hospital.length, 1);
});
test('счёт показывает сумму строки и остаток, отменённый или возвращённый счёт не предъявляет остаток', () => {
  const context = ui();
  const bill = { totalAmount: '2000', paidAmount: '500', status: 'PARTIAL', items: [{ title: 'Услуга', quantity: '2', totalAmount: '2000' }] };
  const html = context.renderBills([bill]);
  assert.match(html, /2 шт., сумма 2\s?000/);
  assert.match(html, /Остаток:[\s\S]*1\s?500/);
  assert.doesNotMatch(html, /×/);
  const discounted = context.renderBills([{ ...bill, totalAmount: '1800', items: [{ title: 'Со скидкой', quantity: '2', totalAmount: '1800' }] }]);
  assert.match(discounted, /сумма 1\s?800/); assert.match(discounted, /Остаток:[\s\S]*1\s?300/);
  assert.match(context.renderBills([{ ...bill, paidAmount: '2500' }]), /Оплата сверх суммы счёта: 500/);
  assert.doesNotMatch(context.renderBills([{ ...bill, status: 'REFUNDED' }]), /Остаток:/);
  assert.doesNotMatch(context.renderBills([{ ...bill, status: 'CANCELLED' }]), /Остаток:/);
});
test('аналитическая карточка не рисует скрытое значение, показывает референс и экранирует текст', () => {
  const context = ui();
  const html = context.renderLaboratory([{ status: 'IN_PROGRESS', items: [{ status: 'ORDERED', title: '<img src=x>', resultValue: 'INTERNAL_MARKER', referenceRange: '3–6' }, { status: 'COMPLETED', title: 'Глюкоза', resultValue: '4', unit: 'ммоль/л' }] }]);
  assert.ok(!html.includes('INTERNAL_MARKER')); assert.ok(!html.includes('<img src=x>'));
  assert.ok(html.includes('Референс: 3–6')); assert.ok(html.includes('4 · ммоль/л'));
});
test('новый питомец доступен при пустом кабинете, реклама паспорта сохраняет правильный адрес', () => {
  const context = ui();
  const html = context.renderBookingForm([]);
  assert.match(html, /Новый питомец/); assert.doesNotMatch(html, /disabled/);
  const promo = context.renderServicePromo();
  assert.match(promo, /https:\/\/temichevvet.ru\/pet/); assert.match(promo, /паспорт питомца/i);
});
test('сводка стационара использует дату измерения, не выдаёт выдуманное состояние', () => {
  const context = ui();
  const html = context.renderHospital([{ latestTemperature: { value: '38.2', measuredAt: '2026-09-13T09:00:00Z' }, completedCare: [{ type: 'CARE', count: 1 }] }]);
  assert.match(html, /38.2 °C/); assert.match(html, /13 сент/); assert.doesNotMatch(html, /стабил/i);
});

test('ошибка обновления сохраняет данные и объясняет их давность; отзыв сессии убирает кабинет', async () => {
  const context = ui();
  vm.runInContext("portalResponse = { ownerId: 'a', snapshot: { animals: [{ id: 'cat' }] } }", context);
  context.fetch = async () => ({ ok: false, status: 503, text: async () => JSON.stringify({ message: 'Unavailable' }) });
  await context.refreshPortal();
  assert.equal(vm.runInContext('portalResponse.snapshot.animals[0].id', context), 'cat');
  assert.match(context.nodes.get('#refresh-status').textContent, /предыдущие данные/);
  context.fetch = async () => ({ ok: false, status: 403, text: async () => JSON.stringify({ message: 'Сессия завершена' }) });
  await context.refreshPortal();
  assert.equal(vm.runInContext('portalResponse', context), null);
  assert.match(context.nodes.get('#app').innerHTML, /Кабинет пока не открыт/);
});
