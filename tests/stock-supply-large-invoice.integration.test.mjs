import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { performance } from 'node:perf_hooks';
import { PrismaClient } from '@prisma/client';
import { StockService } from '../apps/api/dist/modules/stock/stock.service.js';

const url = process.env.STOCK_RELEASE_TEST_DATABASE_URL;
test('100-line receipt and correction preserve quantities, kopecks and unchanged movements', { skip: !url }, async (t) => {
  const parsed = new URL(url);
  assert.ok(['127.0.0.1', 'localhost'].includes(parsed.hostname) && /^\/stock_release_qa_\d+$/.test(parsed.pathname), 'Only disposable local stock QA is allowed');
  const db = new PrismaClient({ datasources: { db: { url } } });
  t.after(() => db.$disconnect());
  const stock = new StockService(db, { log: async () => {} });
  const organization = await db.organization.create({ data: { displayName: 'Длинная накладная QA' } });
  const office = await db.clinicOffice.create({ data: { organizationId: organization.id, name: 'Филиал QA' } });
  const employee = await db.employee.create({ data: { fullName: 'Складской тест QA' } });
  const warehouse = await db.warehouse.create({ data: { officeId: office.id, name: 'Склад длинной накладной QA' } });
  const supplier = await db.supplier.create({ data: { title: 'Поставщик длинной накладной QA' } });
  const product = await db.product.create({ data: { title: 'Препарат длинной накладной QA', stockUnit: 'мл', writeOffUnit: 'мл', billingUnit: 'инъекция', retailPrice: 250 } });
  const items = Array.from({ length: 100 }, (_, i) => ({ productId: product.id, warehouseId: warehouse.id, quantity: 2, receiptUnit: 'флакон', conversionFactor: 10, lineAmount: 1000.56, purchasePrice: 500.28, discountAmount: 0.11, retailPrice: 250, series: `QA-${i}` }));
  const start = performance.now();
  const created = await stock.createSupplyInvoice({ supplierId: supplier.id, number: 'QA-100', items }, employee.id);
  const createMs = performance.now() - start;
  assert.equal(created.items.length, 100);
  assert.equal(created.totalAmount.toString(), '100045');
  for (const item of created.items) {
    assert.equal(item.quantity.toString(), '20');
    assert.equal(item.receiptQuantity.toString(), '2');
    assert.equal(item.lineAmount.toString(), '1000.56');
  }
  const correctedItems = created.items.map((item, i) => ({ ...items[0], id: item.id, series: item.series, quantity: i === 0 ? 3 : 2 }));
  const correctionStart = performance.now();
  const corrected = await stock.updateSupplyInvoice(created.id, { items: correctedItems }, employee.id);
  const correctionMs = performance.now() - correctionStart;
  assert.equal(corrected.totalAmount.toString(), '100045');
  assert.deepEqual(new Set(corrected.items.map(item => item.id)), new Set(created.items.map(item => item.id)));
  const batches = await db.stockBatch.findMany({ where: { id: { in: corrected.items.map(item => item.stockBatchId) } } });
  assert.equal(batches.reduce((sum, batch) => sum + Number(batch.rest), 0), 2010);
  const movementCount = await db.stockMovement.count({ where: { productId: product.id } });
  assert.equal(movementCount, 101, 'Unchanged lines do not create correction movements');
  await stock.updateSupplyInvoice(created.id, { items: correctedItems }, employee.id);
  assert.equal(await db.stockMovement.count({ where: { productId: product.id } }), movementCount, 'Repeated correction does not duplicate stock movements');
  t.diagnostic(`Disposable local PostgreSQL: create=${Math.round(createMs)}ms, correction=${Math.round(correctionMs)}ms`);
});
