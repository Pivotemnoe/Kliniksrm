import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { VisitsService } from '../apps/api/dist/modules/visits/visits.service.js';
import { BillingService } from '../apps/api/dist/modules/billing/billing.service.js';
import { SchedulingService } from '../apps/api/dist/modules/scheduling/scheduling.service.js';
import { AuditService } from '../apps/api/dist/modules/audit/audit.service.js';

const url = process.env.NIGHT_REPORTS_TEST_DATABASE_URL;
test('night visit financial amendments are atomic, audited and isolated from daytime permissions', { skip: !url }, async t => {
  const parsed = new URL(url);
  assert.ok(parsed.hostname === '127.0.0.1' && parsed.port === '15488' && /^\/night_reports_qa_\d+$/.test(parsed.pathname));
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-16T01:00:00Z') });
  const db = new PrismaClient({ datasources: { db: { url } } });
  t.after(() => db.$disconnect());
  const audit = new AuditService(db), scheduling = new SchedulingService(db, audit);
  const finance = { getDefaultBillDueAt: async () => null };
  const billing = new BillingService(db, audit, scheduling, finance);
  const visits = new VisitsService(db, audit, scheduling, finance, {}, { enqueue: async () => {}, syncNow: async () => {} }, billing);
  const org = await db.organization.create({ data: { displayName: 'Ночная QA' } });
  const office = await db.clinicOffice.create({ data: { organizationId: org.id, name: 'Филиал QA', timezone: 'Europe/Moscow' } });
  const warehouse = await db.warehouse.create({ data: { officeId: office.id, name: 'Склад QA' } });
  const employee = await db.employee.create({ data: { fullName: 'Ночной врач QA' } });
  const actor = { id: employee.id, roles: ['doctor'], permissions: ['visits.manage'] };
  const owner = await db.owner.create({ data: { fullName: 'Вымышленный владелец QA' } });
  const animal = await db.animal.create({ data: { ownerId: owner.id, nickname: 'Пациент QA', species: 'CAT' } });
  const product = await db.product.create({ data: { title: 'Препарат ночной QA', stockUnit: 'мл', writeOffUnit: 'мл', billingUnit: 'инъекция', retailPrice: 100 } });
  const material = await db.product.create({ data: { title: 'Материал ночной QA', stockUnit: 'шт', writeOffUnit: 'шт' } });
  const batch = await db.stockBatch.create({ data: { productId: product.id, warehouseId: warehouse.id, quantity: 100, rest: 100 } });
  const materialBatch = await db.stockBatch.create({ data: { productId: material.id, warehouseId: warehouse.id, quantity: 100, rest: 100 } });
  await db.productLinkedProduct.create({ data: { sourceProductId: product.id, productId: material.id, quantity: 2 } });
  const visit = await db.visit.create({ data: { ownerId: owner.id, animalId: animal.id, employeeId: employee.id, status: 'COMPLETED', visitType: 'FOLLOW_UP', completedAt: new Date('2026-10-15T17:00:00Z') } });
  const bill = await db.bill.create({ data: { visitId: visit.id, ownerId: owner.id, animalId: animal.id, source: 'VISIT', status: 'PAID', totalAmount: 100, paidAmount: 100, items: { create: { productId: product.id, title: product.title, quantity: 1, stockQuantity: 2, unitPrice: 100, totalAmount: 100 } } }, include: { items: true } });
  const payment = await db.payment.create({ data: { billId: bill.id, type: 'CASH', amount: 100, employeeId: employee.id } });
  await db.$transaction(tx => billing.reconcileNightVisitStock(tx, bill.id, null));
  const rests = async () => (await db.stockBatch.findMany({ where: { id: { in: [batch.id, materialBatch.id] } }, orderBy: { productId: 'asc' } })).map(row => [row.id, row.rest.toString()]);
  await t.test('paid item can be corrected after 60 minutes; debt and stock delta are correct', async () => {
    const view = await visits.getVisit(visit.id, actor);
    assert.equal(view.nightServicesEditableUntil, '2026-10-16T06:00:00.000Z');
    await visits.updateService(visit.id, bill.items[0].id, { quantity: 2, stockQuantity: 3 }, actor);
    const changed = await db.bill.findUnique({ where: { id: bill.id } });
    assert.equal(changed.totalAmount.toString(), '200'); assert.equal(changed.paidAmount.toString(), '100'); assert.equal(changed.status, 'PARTIAL');
    assert.equal((await db.stockBatch.findUnique({ where: { id: batch.id } })).rest.toString(), '97');
    assert.equal((await db.stockBatch.findUnique({ where: { id: materialBatch.id } })).rest.toString(), '96');
    const moves = await db.stockMovement.count({ where: { billItemId: bill.items[0].id } });
    await visits.updateService(visit.id, bill.items[0].id, { quantity: 2, stockQuantity: 3 }, actor);
    assert.equal(await db.stockMovement.count({ where: { billItemId: bill.items[0].id } }), moves);
    assert.equal((await db.payment.findUnique({ where: { id: payment.id } })).amount.toString(), '100');
    const events = await db.auditLog.findMany({ where: { action: 'visit_service.night_amendment', entityId: visit.id } });
    assert.equal(events.length, 2); assert.equal(events[0].metadata.before.paidAmount, '100'); assert.equal(events[0].metadata.after.totalAmount, '200');
  });
  await t.test('insufficient linked material rolls back line, totals, stock and audit', async () => {
    const before = await rests(), eventCount = await db.auditLog.count({ where: { action: 'visit_service.night_amendment' } });
    await assert.rejects(visits.updateService(visit.id, bill.items[0].id, { quantity: 100, stockQuantity: 4 }, actor));
    assert.deepEqual(await rests(), before);
    assert.equal((await db.billItem.findUnique({ where: { id: bill.items[0].id } })).quantity.toString(), '2');
    assert.equal(await db.auditLog.count({ where: { action: 'visit_service.night_amendment' } }), eventCount);
  });
  await t.test('deleting a paid line preserves payment and records overpayment with full stock return', async () => {
    await visits.deleteService(visit.id, bill.items[0].id, actor);
    const changed = await db.bill.findUnique({ where: { id: bill.id } });
    assert.equal(changed.totalAmount.toString(), '0'); assert.equal(changed.paidAmount.toString(), '100'); assert.equal(changed.status, 'PAID');
    assert.equal((await db.stockBatch.findUnique({ where: { id: batch.id } })).rest.toString(), '100');
    assert.equal((await db.stockBatch.findUnique({ where: { id: materialBatch.id } })).rest.toString(), '100');
    assert.equal(await db.payment.count({ where: { billId: bill.id } }), 1);
  });
  await t.test('another doctor and a previous night remain locked', async () => {
    await assert.rejects(visits.addService(visit.id, { productId: product.id, quantity: 1 }, { ...actor, id: 'another-doctor' }), /60 минут/);
    await db.visit.update({ where: { id: visit.id }, data: { completedAt: new Date('2026-10-14T17:00:00Z') } });
    await assert.rejects(visits.addService(visit.id, { productId: product.id, quantity: 1 }, actor), /60 минут/);
  });
  await t.test('night completion allows an empty financial list while primary exam checks remain', async () => {
    const draft = await db.visit.create({ data: { ownerId: owner.id, animalId: animal.id, employeeId: employee.id, visitType: 'FOLLOW_UP', status: 'IN_PROGRESS' } });
    assert.equal((await visits.completeVisit(draft.id, actor)).status, 'COMPLETED');
    const primary = await db.visit.create({ data: { ownerId: owner.id, animalId: animal.id, employeeId: employee.id, visitType: 'PRIMARY', status: 'IN_PROGRESS' } });
    await assert.rejects(visits.completeVisit(primary.id, actor));
  });
});
