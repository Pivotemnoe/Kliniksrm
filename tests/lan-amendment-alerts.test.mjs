import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
const require = createRequire(import.meta.url);
require('reflect-metadata');
const { HospitalService } = require('../apps/api/dist/modules/hospital/hospital.service.js');
const { onlineManager } = require('@tanstack/react-query');

test('LAN queries and mutations execute when internet detection is offline', async () => {
  const source = await readFile('apps/web/src/app/queryClient.ts', 'utf8');
  const compiled = await transform(source, { loader: 'ts', format: 'cjs' });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled.code)(require, module, module.exports);
  const { queryClient } = module.exports;
  onlineManager.setOnline(false);
  try {
    assert.equal(queryClient.getDefaultOptions().queries.networkMode, 'always');
    assert.equal(queryClient.getDefaultOptions().mutations.networkMode, 'always');
    assert.equal(await queryClient.fetchQuery({ queryKey: ['lan-test'], queryFn: async () => 'local-me' }), 'local-me');
    const mutation = queryClient.getMutationCache().build(queryClient, { mutationFn: async () => 'local-login' });
    assert.equal(await mutation.execute({}), 'local-login');
  } finally { onlineManager.setOnline(true); queryClient.clear(); }
});

function harness(status = 'COMPLETED', hasCatalog = false) {
  const original = { id: 'record', recordType: 'MEDICATION', recordStatus: status, recordedAt: new Date(), title: 'Препарат', billItemId: null,
    plannedProductId: hasCatalog ? 'product' : null, plannedServiceId: null, plannedQuantity: hasCatalog ? 1 : null, plannedStockQuantity: hasCatalog ? 1 : null, plannedUnitPrice: hasCatalog ? 50 : null, amendments: [] };
  let writes = 0;
  const tx = { $queryRaw: async () => [], hospitalStay: { findUniqueOrThrow: async () => ({ status: 'ACTIVE' }) }, hospitalRecord: {
    findFirst: async () => original,
    create: async ({ data }) => { const row = { id: 'amendment', ...data }; if (data.plannedProductId || data.plannedServiceId) original.amendments.unshift(row); return row; },
  } };
  const prisma = { $transaction: fn => fn(tx) };
  const service = new HospitalService(prisma, { log: async () => {} });
  service.auditService = { log: async () => {} };
  service.getExistingHospitalStay = async () => ({ id: 'stay', sourceVisitId: 'visit', status: 'ACTIVE' });
  service.getWarehouseScope = async () => null;
  service.resolveCatalogLine = async (_, dto) => ({ productId: dto.productId ?? null, serviceId: dto.serviceId ?? null, quantity: dto.quantity ?? 1, stockQuantity: dto.stockQuantity ?? 1, unitPrice: dto.unitPrice ?? 50, totalAmount: 50 });
  service.writeOffHospitalProduct = async () => { writes++; };
  service.writeOffLinkedHospitalProducts = async () => {};
  return { service, original, tx, writes: () => writes };
}
const input = { reason: 'Пропущен склад', recordType: 'MEDICATION', title: 'Препарат', productId: 'product', quantity: 1, stockQuantity: 1, unitPrice: 50 };

test('completed journal entry can account for a missed product exactly once without rewriting original', async () => {
  const h = harness();
  const amendment = await h.service.createAmendment('stay', 'record', input, 'actor');
  assert.equal(amendment.recordStatus, 'AMENDMENT');
  assert.equal(amendment.parentRecordId, 'record');
  assert.equal(h.original.plannedProductId, null);
  assert.equal(h.original.recordStatus, 'COMPLETED');
  assert.equal(h.writes(), 1);
  await assert.rejects(() => h.service.createAmendment('stay', 'record', input, 'actor'), /Проведённое списание/);
  assert.equal(h.writes(), 1);
});

test('planned correction defers stock and closed/skipped/posted entries reject extra accounting', async () => {
  const planned = harness('PLANNED');
  await planned.service.createAmendment('stay', 'record', input, 'actor');
  assert.equal(planned.writes(), 0);
  for (const h of [harness('SKIPPED'), harness('COMPLETED', true)]) {
    await assert.rejects(() => h.service.createAmendment('stay', 'record', input, 'actor'));
    assert.equal(h.writes(), 0);
  }
  const closed = harness();
  closed.tx.hospitalStay.findUniqueOrThrow = async () => ({ status: 'DISCHARGED' });
  await assert.rejects(() => closed.service.createAmendment('stay', 'record', input, 'actor'), /активном стационаре/);
});

test('doctor banners exclude nonclinical alerts; discharge includes amendment catalog', async () => {
  const alerts = await readFile('apps/web/src/layouts/GlobalOperationalAlerts.tsx', 'utf8');
  assert.match(alerts, /!clinicalOnly && item.unread/);
  assert.match(alerts, /clinicalOnly \? undefined : unreadConversations/);
  assert.match(alerts, /remoteAccessMode && !clinicalOnly/);
  const service = await readFile('apps/api/src/modules/hospital/hospital.service.ts', 'utf8');
  const pending = service.split('const pendingRecords =')[1].split('orderBy:')[0];
  assert.match(pending, /amendments: \{ some:/);
  assert.match(pending, /recordStatus: HospitalRecordStatus.COMPLETED/);
});
