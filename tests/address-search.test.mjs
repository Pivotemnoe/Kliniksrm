import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { addressSearchQuery } = createRequire(import.meta.url)('../apps/api/dist/modules/addresses/address-search.js');

test('address search normalizes Russian abbreviations and preserves an explicit locality', () => {
  assert.equal(addressSearchQuery('г. Армавир, ул. Ленина, д. 15').tsquery, 'армавир:* & ленина:* & 15:*');
  assert.equal(addressSearchQuery('Ставрополь, ул. Ленина').tsquery, 'ставрополь:* & ленина:*');
  assert.equal(addressSearchQuery('посёлок Заветный').tsquery, 'заветный:*');
});
test('apartment stays manual; punctuation cannot inject tsquery operators', () => {
  assert.equal(addressSearchQuery('Армавир Мира 12, кв. 5').tsquery, 'армавир:* & мира:* & 12:*');
  assert.equal(addressSearchQuery("' | ! : &").valid, false);
  assert.equal(addressSearchQuery('а').valid, false);
  assert.equal(addressSearchQuery('Ленина').hasNumber, false);
  assert.equal(addressSearchQuery('Ленина 15').hasNumber, true);
});

test('explicit locality restricts results; unknown place does not silently select Armavir', async () => {
  const { AddressesService } = createRequire(import.meta.url)('../apps/api/dist/modules/addresses/addresses.service.js');
  const calls = [];
  const prisma = { $queryRaw: async (strings, ...values) => {
    if (strings.join('').includes('DISTINCT')) return [{name:'Армавир', level:5}, {name:'Ставрополь', level:5}, {name:'Заветный', level:6}, {name:'Ленина', level:6}];
    calls.push(values);
    return [{id: 123n, label:'test', level:8, sourceVersion:20260929}];
  } };
  const service = new AddressesService(prisma);
  const result = await service.suggest('г. Ставрополь, ул. Мира');
  assert.equal(result.suggestions[0].id, '123');
  assert.ok(calls[0].includes('|ставрополь|'));
  await service.suggest('Неизвестныйпоселок Мира');
  assert.ok(!calls[1].includes('|армавир|'));
  assert.equal(calls[1][1], '');
  await service.suggest('Ленина');
  assert.equal(calls[2][1], '');
  await service.suggest('Ленина, д. 15');
  assert.equal(calls[3][1], '');
  await service.suggest('х. Ленина, д. 15');
  assert.ok(calls[4].includes('|ленина|'));
  await service.suggest('Заветный Мира');
  assert.ok(calls[5].includes('|заветный|'));
  await service.suggest('Ставрополь');
  assert.ok(calls[6].includes('|ставрополь|'));
});

test('colloquial Starostanichnaya locality resolves to the GAR name without renaming streets', () => {
  const { normalizeAddressInput } = createRequire(import.meta.url)('../apps/api/dist/modules/addresses/address-search.js');
  assert.equal(normalizeAddressInput('Старостаничная, Мира'), 'старая станица, мира');
  assert.equal(normalizeAddressInput('Армавир, ул. Старостаничная'), 'армавир, ул. старостаничная');
});
