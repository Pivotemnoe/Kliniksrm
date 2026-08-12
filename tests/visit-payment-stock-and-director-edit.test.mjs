import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

function methodBody(source, signature, nextSignature) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `Не найден метод ${signature}`);
  const end = source.indexOf(nextSignature, start + signature.length);
  assert.notEqual(end, -1, `Не найдена граница ${nextSignature}`);
  return source.slice(start, end);
}

test('обычная позиция приёма не списывает склад до полной оплаты', async () => {
  const [visits, billing, visitPage] = await Promise.all([
    read('apps/api/src/modules/visits/visits.service.ts'),
    read('apps/api/src/modules/billing/billing.service.ts'),
    read('apps/web/src/features/visits/VisitServicesTab.tsx'),
  ]);

  const addVisitService = methodBody(visits, 'async addService(', 'async addServices(');
  const addBillItem = methodBody(billing, 'async addBillItem(', 'async updateBillItem(');
  const createPayment = methodBody(billing, 'async createPayment(', 'async refundPayment(');
  const refundPayment = methodBody(billing, 'async refundPayment(', 'private async resolveBillCreationData(');
  const bulkPay = methodBody(billing, 'async bulkPayBills(', 'async reopenBill(');
  const paymentWriteOff = methodBody(billing, 'private async ensureBillProductItemsWrittenOff(', 'private async restoreBillProductItems(');
  const itemEditGuard = methodBody(billing, 'private async ensureBillCanBeEdited(', 'private async ensureBillCanBePaid(');
  const paymentLock = methodBody(billing, 'private async getBillForUpdate(', 'private async lockBillsForUpdate(');

  assert.doesNotMatch(addVisitService, /stockBatch\.update|stockMovement\.create|writeOff/);
  assert.doesNotMatch(addBillItem, /stockBatch\.update|stockMovement\.create|writeOff/);
  assert.match(createPayment, /updatedBill\.status === PaymentStatus\.PAID/);
  assert.match(createPayment, /ensureBillProductItemsWrittenOff/);
  assert.match(bulkPay, /ensureBillProductItemsWrittenOff/);
  assert.match(refundPayment, /updatedBill\.status !== PaymentStatus\.PAID[\s\S]*restoreBillProductItems/);
  assert.match(paymentWriteOff, /bill\.source === BillSource\.SALE[\s\S]*return/);
  assert.match(paymentWriteOff, /hospitalRecord[\s\S]*if \(item\.hospitalRecord\) continue/);
  assert.match(itemEditGuard, /bill\.source === BillSource\.SALE/);
  assert.match(paymentLock, /FOR UPDATE/);
  assert.match(visitPage, /спишется только после полной оплаты счёта/);
  assert.match(visitPage, /Ожидает полной оплаты/);
  assert.match(visitPage, /getNetStockWriteOffQuantity/);
  assert.match(visitPage, /billFinanciallyLocked/);
});

test('отмена неоплаченного приёма отменяет счёт и возвращает только старые преждевременные движения', async () => {
  const [visits, migration] = await Promise.all([
    read('apps/api/src/modules/visits/visits.service.ts'),
    read('prisma/migrations/20260812000300_defer_bill_stock_writeoff_until_paid/migration.sql'),
  ]);
  const setStatus = methodBody(visits, 'private async setStatus(', 'private async getExistingVisit(');
  const cancelBill = methodBody(visits, 'private async cancelUnpaidVisitBill(', 'private async restoreCurrentVisitProductWriteOff(');

  assert.match(setStatus, /status === VisitStatus\.CANCELLED[\s\S]*cancelUnpaidVisitBill/);
  assert.match(cancelBill, /paidAmount[\s\S]*greaterThan\(0\)/);
  assert.match(cancelBill, /FOR UPDATE/);
  assert.match(cancelBill, /restoreCurrentVisitProductWriteOff/);
  assert.match(cancelBill, /status: PaymentStatus\.CANCELLED/);
  assert.match(migration, /b\."status" IN \('UNPAID', 'PARTIAL', 'REFUNDED', 'CANCELLED'\)/);
  assert.match(migration, /LEFT JOIN "HospitalRecord"/);
  assert.match(migration, /hr\."id" IS NULL/);
  assert.match(migration, /INSERT INTO "StockMovement"/);
  assert.match(migration, /'CORRECTION'/);
  assert.doesNotMatch(migration, /DELETE\s+FROM|TRUNCATE|DROP\s+TABLE/i);
});

test('директор может аудируемо исправлять клиническую часть завершённого и отменённого приёма удалённо', async () => {
  const [visits, visitPage, authGuard] = await Promise.all([
    read('apps/api/src/modules/visits/visits.service.ts'),
    read('apps/web/src/features/visits/VisitCardPage.tsx'),
    read('apps/api/src/modules/auth/session-auth.guard.ts'),
  ]);

  const editable = methodBody(visits, 'function ensureVisitEditable(', 'function ensureVisitBillItemEditable(');
  const visitBill = methodBody(visits, 'private async getOrCreateVisitBill(', 'private async getVisitBillItem(');
  assert.ok(editable.indexOf("actor.roles.includes('director')") < editable.indexOf('VisitStatus.CANCELLED'));
  assert.match(visitBill, /FOR UPDATE[\s\S]*ensureVisitBillItemEditable\(existingBill\)/);
  assert.match(visitPage, /employee\?\.roles\.includes\('director'\)[\s\S]*return false/);
  assert.match(visitPage, /Приём отменён, но открыт директору для аудируемого исправления/);
  assert.match(authGuard, /remoteDirectorMutation[\s\S]*remote_access\.director_write/);
});

test('клинический каталог доступен по visits.manage и несколько позиций сохраняются одной транзакцией', async () => {
  const [controller, service, picker, page, api] = await Promise.all([
    read('apps/api/src/modules/visits/visits.controller.ts'),
    read('apps/api/src/modules/visits/visits.service.ts'),
    read('apps/web/src/features/stock/useCatalogPicker.ts'),
    read('apps/web/src/features/visits/VisitServicesTab.tsx'),
    read('apps/web/src/features/visits/visits.api.ts'),
  ]);

  assert.match(controller, /@Get\('catalog\/clinical'\)[\s\S]*@RequirePermissions\('visits\.manage'\)/);
  assert.match(controller, /@Post\(':visitId\/services\/bulk'\)/);
  const bulk = methodBody(service, 'async addServices(', 'async updateService(');
  assert.match(bulk, /this\.prisma\.\$transaction/);
  assert.match(bulk, /for \(const serviceLine of serviceLines\)/);
  assert.match(bulk, /visit_service\.bulk_add/);
  assert.match(picker, /useVisitProductCatalogPicker/);
  assert.match(picker, /useVisitServiceCatalogPicker/);
  assert.doesNotMatch(picker, /knownItems|setKnownItems/);
  assert.match(api, /services\/bulk/);
  assert.match(page, /Добавить позицию в общий список/);
  assert.match(page, /Сохранить подготовленные/);
});

test('стационар открывает активных пациентов, а архив остаётся доступен фильтрами', async () => {
  const page = await read('apps/web/src/features/hospital/HospitalPage.tsx');

  assert.match(page, /useState<HospitalStayStatus \| 'ALL'>\('ACTIVE'\)/);
  assert.match(page, /Сейчас в стационаре/);
  assert.match(page, /Вся история/);
  assert.match(page, /Архив: выписанные/);
  assert.match(page, /Архив: отменённые/);
});
