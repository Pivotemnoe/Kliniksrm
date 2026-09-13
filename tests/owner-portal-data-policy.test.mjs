import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url);
const { toOwnerLaboratoryOrder, ownerGatewayFileWhere, isOwnerDiagnosis, toOwnerHospitalStay } = require('../apps/api/dist/modules/client-portal/owner-data-policy.js');
const { ClientPortalService } = require('../apps/api/dist/modules/client-portal/client-portal.service.js');

const item = (status, extra = {}) => ({ id: status, title: 'Глюкоза', code: 'GLU', status, unit: 'ммоль/л', referenceRange: '3–6', resultValue: '7', resultText: 'Результат', completedAt: new Date('2026-09-13'), ...extra });
const order = (status, items) => ({ id: 'lab-1', status, createdAt: new Date('2026-09-12'), completedAt: null, comment: 'INTERNAL_MARKER', formSnapshots: [{ secret: 'INTERNAL_MARKER' }], items });

test('готовый показатель выдаётся в ещё открытом исследовании, черновик скрыт вместе с результатом и датой', () => {
  const result = toOwnerLaboratoryOrder(order('IN_PROGRESS', [item('COMPLETED'), item('IN_PROGRESS'), item('ORDERED')]));
  assert.equal(result.items[0].resultValue, '7');
  assert.equal(result.items[0].referenceRange, '3–6');
  for (const pending of result.items.slice(1)) {
    assert.equal(pending.resultValue, null);
    assert.equal(pending.resultText, null);
    assert.equal(pending.completedAt, null);
  }
  assert.ok(!JSON.stringify(result).includes('INTERNAL_MARKER'));
});

test('отмена заказа скрывает ранее готовое значение; незавершённый показатель не раскрывается даже в закрытом заказе', () => {
  const cancelled = toOwnerLaboratoryOrder(order('CANCELLED', [item('COMPLETED')]));
  assert.equal(cancelled.items[0].resultValue, null);
  assert.equal(cancelled.items[0].status, 'CANCELLED');
  assert.equal(toOwnerLaboratoryOrder(order('COMPLETED', [item('ORDERED')])).items[0].resultValue, null);
});

test('лабораторный ответ строится из разрешённых полей и не меняет исходные данные', () => {
  const source = order('COMPLETED', [item('COMPLETED', { comment: 'INTERNAL_MARKER', purchasePrice: 'INTERNAL_MARKER' })]);
  const before = JSON.stringify(source);
  const result = toOwnerLaboratoryOrder(source);
  assert.equal(JSON.stringify(source), before);
  assert.ok(!JSON.stringify(result).includes('INTERNAL_MARKER'));
});

test('дифференциальный диагноз и черновики исключены, предварительное и окончательное заключение доступны с исходным типом', () => {
  assert.equal(isOwnerDiagnosis({ diagnosisType: 'Дифференциальный', status: null }), false);
  assert.equal(isOwnerDiagnosis({ diagnosisType: 'Окончательный', status: 'DRAFT' }), false);
  assert.equal(isOwnerDiagnosis({ diagnosisType: 'Предварительный', status: null }), true);
  assert.equal(isOwnerDiagnosis({ diagnosisType: 'Окончательный', status: null }), true);
});

test('сводка стационара содержит факты, но не копирует журнал, внутренние тексты и цены', () => {
  const result = toOwnerHospitalStay({
    id: 'stay', status: 'ACTIVE', startedAt: new Date('2026-09-12'), completedAt: null, updatedAt: new Date('2026-09-12'),
    animal: { id: 'cat', nickname: 'Мурка', species: 'Кошка' }, employee: { fullName: 'Врач' },
    dailyRateSnapshot: 'INTERNAL_MARKER', purpose: 'INTERNAL_MARKER',
    sourceVisit: { hospitalRecords: [
      { recordType: 'MEDICATION', recordedAt: new Date('2026-09-13'), completedAt: new Date('2026-09-13'), title: 'INTERNAL_MARKER', notes: 'INTERNAL_MARKER' },
      { recordType: 'TEMPERATURE', recordedAt: new Date('2026-09-13'), temperatureC: '38.2', notes: 'INTERNAL_MARKER' },
    ] },
  });
  assert.equal(result.latestTemperature.value, '38.2');
  assert.equal(result.completedCare.find((x) => x.type === 'MEDICATION').count, 1);
  assert.ok(!JSON.stringify(result).includes('INTERNAL_MARKER'));
  assert.equal('condition' in result, false);
});

test('одна политика файлов используется для владельца, связанных документов и исключения внутренних файлов', () => {
  const where = ownerGatewayFileWhere('owner-a');
  assert.equal(where.deletedAt, null);
  assert.deepEqual(where.visibility, { not: 'INTERNAL' });
  assert.ok(where.purpose.in.includes('LABORATORY_RESULT'));
  assert.ok(where.AND.some((rule) => rule.OR?.some((x) => x.ownerId === null) && rule.OR?.some((x) => x.ownerId === 'owner-a')));
  assert.ok(where.AND.some((rule) => rule.OR?.some((x) => x.animalId === null) && rule.OR?.some((x) => x.animal?.ownerId === 'owner-a')));
  assert.ok(where.AND.some((rule) => rule.OR?.some((x) => x.visitDocument?.status === 'SIGNED')));
});

test('снимок выдаёт анализы и активный стационар независимо от списка завершённых приёмов', async () => {
  const queries = {};
  const delegate = (name, value) => ({ findMany: async (query) => { queries[name] = query; return value; } });
  const db = {
    $transaction: (queries) => Promise.all(queries),
    owner: { findUnique: async () => ({ id: 'owner-a', fullName: 'Пример', animals: [] }) },
    appointment: delegate('appointments', []), visit: delegate('visits', []),
    fileObject: delegate('files', []), bill: delegate('bills', []), notificationOutbox: delegate('notifications', []),
    laboratoryOrder: delegate('labs', [{ ...order('IN_PROGRESS', [item('COMPLETED'), item('ORDERED')]), visit: { id: 'open-visit', animal: { id: 'cat', nickname: 'Мурка' } } }]),
    hospitalStay: delegate('hospital', []), onlineAppointmentRequest: delegate('bookings', []),
  };
  const snapshot = await new ClientPortalService(db, {}, {}).buildOwnerGatewaySnapshot('owner-a');
  assert.equal(snapshot.visits.length, 0);
  assert.equal(snapshot.laboratoryOrders.length, 1);
  assert.equal(snapshot.laboratoryOrders[0].visitId, 'open-visit');
  assert.equal(snapshot.laboratoryOrders[0].items[1].resultValue, null);
  assert.deepEqual(queries.labs.where.visit, { ownerId: 'owner-a', animal: { ownerId: 'owner-a' }, status: { not: 'CANCELLED' } });
  assert.equal(queries.hospital.where.ownerId, 'owner-a');
  assert.equal(queries.hospital.where.status, 'ACTIVE');
  assert.equal(queries.bookings.select.internalComment, undefined);
  assert.equal(snapshot.historyLimits.visits, 30);

  // Exercise the receiving service with the actual CRM builder output: adding a
  // section must not silently break the authenticated production exchange.
  const { InternalSyncService } = require('../apps/owner-gateway/dist/internal-sync.service.js');
  let saved;
  const receiver = new InternalSyncService({ ownerSnapshot: {
    findUnique: async () => null,
    upsert: async (query) => { saved = query; return { ownerId: 'owner-a' }; },
  } }, {}, {}, {}, {});
  const dto = { displayName: 'Пример', payload: snapshot, sourceVersion: 'test', sourceUpdatedAt: new Date().toISOString() };
  await receiver.upsertSnapshot('owner-a', dto);
  assert.deepEqual(saved.create.payload, snapshot);
  saved = undefined;
  await assert.rejects(() => receiver.upsertSnapshot('owner-a', {
    ...dto, payload: { ...snapshot, internalNotes: 'INTERNAL_MARKER' },
  }), /запрещённые разделы/);
  assert.equal(saved, undefined);
});

const { PortalService } = require('../apps/owner-gateway/dist/portal.service.js');
function gatewayForFiles(files, document, sessionOverrides = {}) {
  let lookups = 0;
  const db = {
    portalSession: { findUnique: async () => ({ ownerId: 'owner-a', expiresAt: new Date(Date.now() + 60_000), revokedAt: null, owner: { payload: { files } }, ...sessionOverrides }) },
    portalDocument: { findUnique: async ({ where }) => { lookups++; assert.equal(where.ownerId_sourceFileId.ownerId, 'owner-a'); return document; } },
  };
  return { service: new PortalService(db), lookups: () => lookups };
}

test('прямая ссылка на исключённый из снимка файл не читает оставшиеся байты шлюза', async () => {
  const gateway = gatewayForFiles([], { content: Buffer.from('previous data') });
  await assert.rejects(() => gateway.service.getDocument('session', 'old-file'), /недоступен/);
  assert.equal(gateway.lookups(), 0);
});

test('исправленный документ не выдаёт старую версию, пока байты новой версии не синхронизированы', async () => {
  const gateway = gatewayForFiles([{ id: 'file', checksumSha256: 'new' }], { content: Buffer.from('old'), checksumSha256: 'old' });
  await assert.rejects(() => gateway.service.getDocument('session', 'file'), /ещё не синхронизирован/);
});

test('разрешённый документ выдаётся только из снимка текущего владельца и действующей сессии', async () => {
  const gateway = gatewayForFiles([{ id: 'file', checksumSha256: 'current' }], { fileName: 'result.pdf', content: Buffer.from('current'), checksumSha256: 'current' });
  assert.equal((await gateway.service.getDocument('session', 'file')).content.toString(), 'current');
  await assert.rejects(() => gateway.service.getDocument('session', 'another-owner-file'), /недоступен/);
  const revoked = gatewayForFiles([{ id: 'file' }], {}, { revokedAt: new Date() });
  await assert.rejects(() => revoked.service.getDocument('session', 'file'), /недействительна/);
  assert.equal(revoked.lookups(), 0);
});

function gatewayForBookings() {
  const created = new Map();
  const snapshot = { animals: [{ id: 'cat', nickname: 'Мурка' }], appointments: [{ id: 'appointment-a', status: 'PLANNED', startsAt: '2099-01-01T10:00:00Z', animal: { id: 'cat' } }], bookingRequests: [{ externalRequestId: 'saved-request', status: 'ACCEPTED', updatedAt: '2026-09-13', appointment: { startsAt: '2099-01-01T10:00:00Z', status: 'PLANNED' }, internalComment: 'INTERNAL_MARKER' }] };
  const db = {
    portalSession: { findUnique: async () => ({ ownerId: 'owner-a', expiresAt: new Date(Date.now() + 60_000), owner: { payload: snapshot } }) },
    portalBookingRequest: {
      findMany: async (query) => { assert.equal(query.where.ownerId, 'owner-a'); return [{ id: 'saved-request', status: 'IMPORTED' }]; },
      upsert: async (query) => { const key = query.where.ownerId_clientRequestId.clientRequestId; if (!created.has(key)) created.set(key, query.create); return created.get(key); },
    },
  };
  return { service: new PortalService(db), created };
}
test('заявка получает подтверждённое время из CRM без служебного комментария', async () => {
  const gateway = gatewayForBookings();
  const result = await gateway.service.listBookingRequests('session');
  assert.equal(result[0].clinicStatus, 'ACCEPTED');
  assert.equal(result[0].appointment.startsAt, '2099-01-01T10:00:00Z');
  assert.ok(!JSON.stringify(result).includes('INTERNAL_MARKER'));
});
test('перенос чужой записи отвергается; перенос своей попадает в обращение без изменения расписания', async () => {
  const gateway = gatewayForBookings();
  const payload = { clientRequestId: 'a'.repeat(20), animalId: 'cat', contactConsent: true, requestType: 'RESCHEDULE', appointmentId: 'foreign-appointment' };
  await assert.rejects(() => gateway.service.createBookingRequest('session', payload), /недоступна/);
  assert.equal(gateway.created.size, 0);
  const result = await gateway.service.createBookingRequest('session', { ...payload, appointmentId: 'appointment-a' });
  assert.match(result.comment, /Перенос записи/); assert.match(result.comment, /appointment-a/);
});
test('новый питомец и повтор неизменённой заявки используют один ключ без создания второго обращения', async () => {
  const gateway = gatewayForBookings();
  const payload = { clientRequestId: 'b'.repeat(20), animalNickname: 'Новый', animalSpecies: 'Кошка', contactConsent: true };
  await gateway.service.createBookingRequest('session', payload);
  await gateway.service.createBookingRequest('session', payload);
  assert.equal(gateway.created.size, 1);
  assert.equal([...gateway.created.values()][0].animalId, null);
});

const { OnlineRequestsService } = require('../apps/api/dist/modules/online-requests/online-requests.service.js');
test('просьба о переносе или отмене не может создать новую запись через обычное подтверждение CRM', async () => {
  const service = new OnlineRequestsService({}, {}, {}, { createAppointment: () => assert.fail('Новая запись не нужна') });
  for (const kind of ['Отмена', 'Перенос']) {
    service.getRequest = async () => ({ source: 'OWNER_GATEWAY', comment: `${kind} записи от 2099-01-01T10:00:00Z (№ appointment-a).`, status: 'NEW' });
    await assert.rejects(() => service.acceptRequest('request', {}, 'actor'), /существующей записи/);
  }
});
