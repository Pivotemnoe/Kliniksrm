import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateSupplyInvoiceDto } from '../apps/api/dist/modules/stock/dto/create-supply-invoice.dto.js';
import { UpdateSupplyInvoiceDto } from '../apps/api/dist/modules/stock/dto/update-supply-invoice.dto.js';
import stockModule from '../apps/api/dist/modules/stock/stock.service.js';
import linksModule from '../apps/api/dist/modules/stock/linked-consumables.js';
import { loadPrintModule } from './helpers/print-module.mjs';
const { prepareSupplyLine, supplyLineAmount } = stockModule;
const { resolveLinkedConsumables, getLinkedConsumables } = linksModule;
const ranges = [
  { product: { id: 's1', title: 'Шприц 1 мл' }, quantity: 1, minDoseMl: 0, maxDoseMl: 1 },
  { product: { id: 's2', title: 'Шприц 2 мл' }, quantity: 1, minDoseMl: 1, maxDoseMl: 2 },
  { product: { id: 's5', title: 'Шприц 5 мл' }, quantity: 1, minDoseMl: 2, maxDoseMl: 5 },
  { product: { id: 's10', title: 'Шприц 10 мл' }, quantity: 1, minDoseMl: 5, maxDoseMl: 10 },
];

test('Nest whitelist keeps the total amount both when creating and correcting an invoice', async () => {
  for (const Dto of [CreateSupplyInvoiceDto, UpdateSupplyInvoiceDto]) {
    const dto = plainToInstance(Dto, { items: [{ productId: '11111111-1111-4111-8111-111111111111', warehouseId: '22222222-2222-4222-8222-222222222222', quantity: 3, purchasePrice: 333.333333, lineAmount: 1000 }] });
    assert.equal((await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).length, 0);
    assert.equal(dto.items[0].lineAmount, 1000);
  }
});

test('invoice amount determines cost per stock unit; total does not depend on rounded unit price', () => {
  const input = { productId: 'drug', quantity: 10, purchasePrice: 999, lineAmount: 1000, receiptUnit: 'мл' };
  const line = prepareSupplyLine(input, 'мл');
  assert.equal(line.stockQuantity.toString(), '10');
  assert.equal(line.stockUnitCost.toString(), '100');
  assert.equal(line.receiptUnitCost.toString(), '100');
  const kopecks = prepareSupplyLine({ ...input, lineAmount: 1000.56 }, 'мл');
  assert.equal(kopecks.lineAmount.toString(), '1000.56');
  assert.equal(kopecks.stockUnitCost.toString(), '100.056');
  const bottle = prepareSupplyLine({ ...input, quantity: 2, receiptUnit: 'флакон', conversionFactor: 10, discountAmount: 100 }, 'мл');
  assert.equal(bottle.stockQuantity.toString(), '20');
  assert.equal(bottle.stockUnitCost.toString(), '45');
  assert.equal(bottle.receiptUnitCost.toString(), '500');
  const thirds = prepareSupplyLine({ ...input, quantity: 3, receiptUnit: 'шт' }, 'шт');
  assert.equal(thirds.stockUnitCost.toFixed(6), '333.333333');
  assert.equal(thirds.lineAmount.toString(), '1000');
  assert.equal(supplyLineAmount({ quantity: 3, purchasePrice: 12.5 }).toString(), '37.5');
  assert.throws(() => prepareSupplyLine({ ...input, discountAmount: 1001 }, 'мл'), /сумму и скидку/);
  assert.throws(() => prepareSupplyLine({ ...input, quantity: 0 }, 'мл'), /количество/);
});

test('one syringe is selected by actual dose, including exact range boundaries', () => {
  for (const [dose, expected] of [[0.001, 's1'], [1, 's1'], [1.001, 's2'], [2, 's2'], [2.001, 's5'], [5, 's5'], [5.001, 's10'], [10, 's10']]) {
    const result = resolveLinkedConsumables(ranges, 99, dose);
    assert.equal(result.length, 1);
    assert.equal(result[0].productId, expected);
    assert.equal(result[0].quantity.toString(), '1');
  }
  assert.equal(resolveLinkedConsumables(ranges, 1, 0).length, 0);
  assert.throws(() => resolveLinkedConsumables(ranges, 1, 11), /диапазоны/);
  assert.throws(() => resolveLinkedConsumables([...ranges, { ...ranges[0], maxDoseMl: 2 }], 1, 1), /однозначный/);
  const fixed = { product: { id: 'gloves', title: 'Перчатки' }, quantity: 2 };
  const result = resolveLinkedConsumables([...ranges, fixed], 3, 1.5);
  assert.deepEqual(result.map((item) => [item.productId, item.quantity.toString()]), [['s2', '1'], ['gloves', '6']]);
});

test('selection uses write-off ml rather than billed injection count; fixed service links stay compatible', async () => {
  const tx = {
    productLinkedProduct: { findMany: async () => ranges },
    serviceLinkedProduct: { findMany: async () => [{ product: { id: 'gloves', title: 'Перчатки' }, quantity: 2 }] },
    product: { findUniqueOrThrow: async () => ({ writeOffUnit: 'мл' }) },
  };
  const result = await getLinkedConsumables(tx, { productId: 'drug', quantity: new Prisma.Decimal(1), stockQuantity: new Prisma.Decimal(6) });
  assert.equal(result[0].productId, 's10');
  assert.equal((await getLinkedConsumables(tx, { serviceId: 'procedure', quantity: new Prisma.Decimal(3) }))[0].quantity.toString(), '6');
  tx.product.findUniqueOrThrow = async () => ({ writeOffUnit: 'шт' });
  await assert.rejects(getLinkedConsumables(tx, { productId: 'drug', quantity: new Prisma.Decimal(1) }), /списываемых в мл/);
});

test('owner print sheets use the visit branch phone, never employee or owner phone', () => {
  let html;
  const print = loadPrintModule('visits/visitPrint.ts', (value) => { html = value; });
  const visit = {
    startedAt: '2026-10-08T07:00:00Z', visitType: 'PRIMARY', totalAmount: 0,
    owner: { fullName: 'Владелец', phone: 'OWNER-PRIVATE' },
    animal: { nickname: 'Лео', species: 'CAT' }, employee: { fullName: 'Врач', phone: 'DOCTOR-PRIVATE' },
    diagnoses: [], queueEntry: { officeId: 'branch-2' },
  };
  const organization = { displayName: 'Клиника', legalName: 'ИП Тест', inn: '123', postalAddress: 'Главный адрес', offices: [
    { id: 'branch-1', phone: '+7 111 111-11-11', address: 'Адрес 1' },
    { id: 'branch-2', phone: '+7 222 222-22-22', address: 'Адрес 2' },
  ] };
  for (const run of [() => print.printVisitSheet(visit, organization), () => print.printVisitRecommendation(visit, undefined, organization)]) {
    run();
    assert.match(html, /Телефон: \+7 222 222-22-22/);
    assert.match(html, /Адрес 2/);
    assert.doesNotMatch(html, /111-11-11|OWNER-PRIVATE|DOCTOR-PRIVATE/);
  }
  print.printVisitSheet({ ...visit, queueEntry: undefined, appointment: { officeId: 'branch-1' } }, organization);
  assert.match(html, /Телефон: \+7 111 111-11-11/);
  print.printVisitSheet({ ...visit, queueEntry: { officeId: 'unknown' } }, organization);
  assert.doesNotMatch(html, /Телефон:/);
});
