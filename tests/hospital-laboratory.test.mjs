import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { LaboratoryService } = require('../apps/api/dist/modules/laboratory/laboratory.service.js');

function fixture() {
  const stay = { id: 'stay', sourceVisitId: 'visit', status: 'ACTIVE', sourceVisit: { status: 'COMPLETED' } };
  const test = { id: 'test', title: 'Исследование крови', isActive: true, material: 'Кровь', method: null, documentTemplate: {
    id: 'template', title: 'Кровь', currentVersion: 3,
    layout: { schemaVersion: 1, blocks: [{ id: 'table', type: 'table', headerRows: 1, rows: [['Показатель', 'Результат', 'Ед.', 'Референс'], ['Гемоглобин', '', 'г/л', '120–180']] }] },
  } };
  const orders = []; const items = []; const audit = [];
  const prisma = {
    hospitalStay: { findUnique: async () => stay },
    laboratoryTest: { findUnique: async () => test },
    laboratoryOrder: {
      create: async ({ data }) => { const order = { id: `order-${orders.length}`, status: 'ORDERED', ...data }; orders.push(order); return order; },
      update: async ({ where, data }) => { const order = orders.find(o => o.id === where.id); Object.assign(order, data); return { ...order, items }; },
      findMany: async ({ where }) => orders.filter(o => o.visitId === where.visitId),
      findFirst: async ({ where }) => orders.find(o => o.id === where.id && o.visitId === where.visitId),
      findUnique: async ({ where }) => { const order = orders.find(o => o.id === where.id); return order && { ...order, visit: stay.sourceVisit, items: items.filter(i => i.orderId === order.id) }; },
      findUniqueOrThrow: async ({ where }) => ({ ...orders.find(o => o.id === where.id), items }),
    },
    laboratoryOrderItem: {
      create: async ({ data }) => { const item = { id: `item-${items.length}`, status: 'ORDERED', files: [], ...data }; items.push(item); return item; },
      update: async ({ where, data }) => Object.assign(items.find(i => i.id === where.id), data),
    },
    $transaction: async arg => typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
  };
  return { service: new LaboratoryService(prisma, { log: async event => audit.push(event) }), prisma, stay, test, orders, items, audit };
}

test('hospital result card uses completed source visit and document snapshot without billing or inventory writes', async () => {
  const f = fixture(); const order = await f.service.createHospitalOrder('stay', { testId: 'test' }, 'doctor-2');
  assert.equal(order.visitId, 'visit'); assert.equal(order.createdById, 'doctor-2');
  assert.equal(f.items[0].title, 'Гемоглобин'); assert.equal(f.items[0].billItemId, undefined);
  assert.equal(order.formSnapshots[0].documentTemplateVersion, 3);
  assert.equal(order.formSnapshots[0].bindings[0].itemId, f.items[0].id);
  assert.equal(f.audit[0].metadata.billingCreated, false);
  assert.equal(f.stay.sourceVisit.status, 'COMPLETED');
});

test('hospital list is restricted to this stay source visit, not other patient orders', async () => {
  const f = fixture(); await f.service.createHospitalOrder('stay', { testId: 'test' }, 'doctor');
  f.orders.push({ id: 'foreign', visitId: 'other-visit' });
  assert.equal((await f.service.listHospitalOrders('stay')).length, 1);
  await assert.rejects(f.service.updateHospitalResults('stay', 'foreign', { items: [] }, 'doctor'), /не найден/);
});

test('another specialist saves hospital results into shared laboratory history', async () => {
  const f = fixture(); const order = await f.service.createHospitalOrder('stay', { testId: 'test' }, 'doctor-1');
  await f.service.updateHospitalResults('stay', order.id, { items: [{ itemId: f.items[0].id, status: 'COMPLETED', resultValue: '125,5' }] }, 'doctor-2');
  assert.equal(f.items[0].resultValue, '125,5'); assert.equal(f.orders[0].status, 'COMPLETED');
  assert.equal(f.audit.at(-1).actorId, 'doctor-2');
  assert.equal((await f.service.listHospitalOrders('stay'))[0].id, order.id);
});

test('closed or cancelled hospital cannot create cards or edit results', async () => {
  for (const status of ['DISCHARGED', 'CANCELLED']) {
    const f = fixture(); f.stay.status = status;
    await assert.rejects(f.service.createHospitalOrder('stay', { testId: 'test' }, 'doctor'), /открытом стационаре/);
    await assert.rejects(f.service.updateHospitalResults('stay', 'order', { items: [] }, 'doctor'), /открытом стационаре/);
    assert.equal(f.orders.length, 0);
  }
});

test('missing stay, inactive test or missing form fail before writing a card', async () => {
  const f = fixture(); f.prisma.hospitalStay.findUnique = async () => null;
  await assert.rejects(f.service.listHospitalOrders('missing'), /не найдена/);
  await assert.rejects(f.service.createHospitalOrder('missing', { testId: 'test' }, 'doctor'), /не найдена/);
  for (const badTest of [null, { isActive: false }, { isActive: true, documentTemplate: null }]) {
    const g = fixture(); g.prisma.laboratoryTest.findUnique = async () => badTest;
    await assert.rejects(g.service.createHospitalOrder('stay', { testId: 'test' }, 'doctor'));
    assert.equal(g.orders.length, 0);
  }
});

test('hospital results keep empty-ready and foreign indicator validation', async () => {
  const f = fixture(); const order = await f.service.createHospitalOrder('stay', { testId: 'test' }, 'doctor');
  await assert.rejects(f.service.updateHospitalResults('stay', order.id, { items: [{ itemId: f.items[0].id, status: 'COMPLETED', resultValue: '' }] }, 'doctor'));
  await assert.rejects(f.service.updateHospitalResults('stay', order.id, { items: [{ itemId: 'foreign', resultValue: '1' }] }, 'doctor'), /не принадлежит/);
  assert.equal(f.items[0].status, 'ORDERED');
});

test('hospital UI reuses buffered result editor, scoped API, search and remote read-only guard', () => {
  const source = readFileSync(new URL('../apps/web/src/features/hospital/HospitalLaboratoryPanel.tsx', import.meta.url), 'utf8');
  assert.match(source, /LaboratoryResultsTableDrawer/); assert.match(source, /useDebouncedValue\(search, 250\)/);
  assert.match(source, /updateHospitalLaboratoryResults\(stay.id/); assert.match(source, /!remoteReadOnly/);
  const controller = readFileSync(new URL('../apps/api/src/modules/laboratory/laboratory.controller.ts', import.meta.url), 'utf8');
  assert.match(controller, /@Post\('hospital\/:stayId\/orders'\)\s+@RequirePermissions\('hospital.manage'\)/);
  assert.match(controller, /@Patch\('hospital\/:stayId\/orders\/:orderId\/results'\)\s+@RequirePermissions\('hospital.manage'\)/);
});
