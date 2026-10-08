import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpsertProductDto } from '../apps/api/dist/modules/stock/dto/upsert-product.dto.js';
import { UpdateSyringeRuleDto } from '../apps/api/dist/modules/stock/dto/update-syringe-rule.dto.js';
import { StockService } from '../apps/api/dist/modules/stock/stock.service.js';
import linksModule from '../apps/api/dist/modules/stock/linked-consumables.js';
const { getLinkedConsumables, SYRINGE_BANDS } = linksModule;

const rule = () => ({ id: 'rule', code: 'SYRINGE', inputKind: 'DOSE_ML', isActive: true, options: SYRINGE_BANDS.map((band) => ({ productId: `s${band.maxValue}`, minValue: band.minValue, maxValue: band.maxValue, quantity: 1, product: { id: `s${band.maxValue}`, title: `Шприц ${band.maxValue} мл`, isActive: true, stockUnit: 'шт', writeOffUnit: 'шт' } })) });
const fake = (rules = [rule()], fixed = []) => ({
  product: { findUniqueOrThrow: async () => ({ writeOffUnit: 'мл', consumableRules: rules.map((rule) => ({ rule })) }) },
  productLinkedProduct: { findMany: async () => fixed },
});
const line = (dose) => ({ productId: 'drug', quantity: new Prisma.Decimal(4), stockQuantity: new Prisma.Decimal(dose) });

test('shared syringe rule chooses exactly one 1/2/5/10 ml product using actual dose', async () => {
  for (const [dose, size] of [[0.001, 1], [1, 1], [1.001, 2], [2, 2], [2.001, 5], [5, 5], [5.001, 10], [10, 10]]) {
    const result = await getLinkedConsumables(fake(), line(dose));
    assert.deepEqual(result.map((item) => [item.productId, item.quantity.toString()]), [[`s${size}`, '1']]);
  }
  assert.deepEqual(await getLinkedConsumables(fake(), line(0)), []);
  await assert.rejects(getLinkedConsumables(fake(), line(10.001)), /диапазоны/);
});

test('shared rule replaces legacy syringes without doubling, keeping unrelated materials', async () => {
  const old = rule().options.map((item) => ({ product: item.product, quantity: 1, minDoseMl: item.minValue, maxDoseMl: item.maxValue }));
  const fixed = { product: { id: 's2', title: 'Шприц 2 мл' }, quantity: 3 };
  const gloves = { product: { id: 'gloves', title: 'Перчатки' }, quantity: 2 };
  const result = await getLinkedConsumables(fake([rule()], [...old, fixed, gloves]), line(2));
  assert.deepEqual(result.map((item) => [item.productId, item.quantity.toString()]), [['gloves', '8'], ['s2', '1']]);
  assert.deepEqual((await getLinkedConsumables(fake([], [gloves]), line(2))).map((item) => [item.productId, item.quantity.toString()]), [['gloves', '8']]);
});

test('shared rules fail safely if disabled, empty, unsupported, or selected SKU is unavailable', async () => {
  for (const change of [
    (r) => { r.isActive = false; },
    (r) => { r.options = []; },
    (r) => { r.inputKind = 'UNKNOWN'; },
    (r) => { r.options[1].product.isActive = false; },
    (r) => { r.options[1].product.stockUnit = 'упак.'; },
  ]) {
    const r = rule(); change(r);
    await assert.rejects(getLinkedConsumables(fake([r]), line(2)), /правило|недоступен/);
  }
});

test('multiple future rules synchronize a shared consumable total once', async () => {
  const first = rule(), second = rule(); second.code = 'NEXT_RULE';
  const result = await getLinkedConsumables(fake([first, second]), line(2));
  assert.deepEqual(result.map((item) => [item.productId, item.quantity.toString()]), [['s2', '2']]);
});

test('service material links are unchanged and do not inherit product syringe rules', async () => {
  const tx = { serviceLinkedProduct: { findMany: async () => [{ product: { id: 'gauze', title: 'Марля' }, quantity: 2 }] } };
  const result = await getLinkedConsumables(tx, { serviceId: 'service', quantity: new Prisma.Decimal(3) });
  assert.equal(result[0].quantity.toString(), '6');
});

test('Nest DTO whitelist retains the checkbox and rejects non-UUID setting products', async () => {
  const dto = plainToInstance(UpsertProductDto, { title: 'Препарат', autoSyringe: true });
  assert.deepEqual(await validate(dto, { whitelist: true, forbidNonWhitelisted: true }), []);
  assert.equal(dto.autoSyringe, true);
  const invalid = plainToInstance(UpdateSyringeRuleDto, { syringe1ProductId: 'wrong' });
  assert.equal((await validate(invalid)).length, 4);
});

test('stock setting persists only the four approved bands and rejects duplicate/packaged products', async () => {
  const ids = Object.fromEntries(SYRINGE_BANDS.map((band, i) => [band.field, `id${i}`]));
  let data;
  const tx = { product: { findMany: async () => Object.values(ids).map((id) => ({ id, stockUnit: 'шт', writeOffUnit: 'шт' })) }, consumableRule: { upsert: async (input) => { data = input; return { id: 'rule', code: 'SYRINGE' }; } } };
  const service = new StockService({ $transaction: async (fn) => fn(tx) }, { log: async () => {} });
  await service.updateSyringeRule(ids, 'actor');
  assert.deepEqual(data.create.options.create.map((item) => [item.minValue, item.maxValue, item.quantity]), [[0, 1, 1], [1, 2, 1], [2, 5, 1], [5, 10, 1]]);
  await assert.rejects(service.updateSyringeRule({ ...ids, syringe2ProductId: ids.syringe1ProductId }, 'actor'), /отдельный/);
  tx.product.findMany = async () => Object.values(ids).map((id) => ({ id, stockUnit: 'упак.', writeOffUnit: 'шт' }));
  await assert.rejects(service.updateSyringeRule(ids, 'actor'), /штуках/);
});
