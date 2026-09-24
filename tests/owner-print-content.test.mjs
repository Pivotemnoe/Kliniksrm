import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPrintModule } from './helpers/print-module.mjs';
const hospital = loadPrintModule('hospital/hospitalPrint.ts');
const base = { id: 'r', recordStatus: 'COMPLETED', recordType: 'PROCEDURE', title: 'ТЕСТ процедура',
  recordedAt: '2026-09-23T09:00:00Z', completedAt: null, value: null, notes: null };

test('owner hospital report excludes planned, cancelled and temperature records', () => {
  const rows = [base, { ...base, title: 'План', recordStatus: 'PLANNED' },
    { ...base, title: 'Отмена', recordStatus: 'CANCELLED' },
    { ...base, title: 'Температура', recordType: 'TEMPERATURE' }];
  const result = JSON.parse(JSON.stringify(hospital.groupOwnerReportRecords(rows, 'Europe/Moscow')));
  assert.deepEqual(result, [{ key: '2026-09-23', label: '23.09.2026', items: ['ТЕСТ процедура'] }]);
});

test('owner report sums product amounts per day and uses Moscow completion date', () => {
  const medication = { ...base, title: 'ТЕСТ препарат', recordType: 'MEDICATION',
    plannedProductId: 'p', plannedStockQuantity: '0.5', plannedProduct: { writeOffUnit: 'мл' } };
  const result = hospital.groupOwnerReportRecords([medication, { ...medication, id: 'r2' },
    { ...medication, id: 'r3', completedAt: '2026-09-23T22:00:00Z' }], 'Europe/Moscow');
  assert.equal(result[0].items[0], 'ТЕСТ препарат - 1 мл');
  assert.equal(result[1].key, '2026-09-24');
  assert.equal(result[1].items[0], 'ТЕСТ препарат - 0,5 мл');
});

test('owner print uses amendment text and escapes markup without staff or owner phone', () => {
  let html;
  const module = loadPrintModule('hospital/hospitalPrint.ts', (value) => { html = value; });
  module.printHospitalSheet({ startedAt: base.recordedAt, animal: { nickname: 'ТЕСТ <кот>' },
    owner: { fullName: 'Тестовый владелец', phone: 'PRIVATE_PHONE' },
    hospitalRecords: [{ ...base, recordedBy: { fullName: 'PRIVATE_STAFF' },
      amendments: [{ title: 'Исправлено <b>', notes: 'ТЕСТ', value: null }] }] });
  assert.match(html, /Исправлено &lt;b&gt;/);
  assert.doesNotMatch(html, /PRIVATE_PHONE|PRIVATE_STAFF|ТЕСТ процедура/);
});

test('laboratory print hides cancelled rows and escapes user result text', () => {
  const module = loadPrintModule('laboratory/laboratoryPrint.ts');
  const html = module.buildLaboratoryOrderPrintHtml({ createdAt: base.recordedAt, status: 'COMPLETED',
    visit: { owner: { fullName: 'Тест' }, animal: { nickname: 'Лео' }, employee: null },
    items: [{ id: 'a', title: 'Показатель', status: 'COMPLETED', resultValue: '<script>bad</script>' },
      { id: 'b', title: 'CANCELLED_SENTINEL', status: 'CANCELLED' }] });
  assert.match(html, /&lt;script&gt;bad&lt;\/script&gt;/);
  assert.doesNotMatch(html, /CANCELLED_SENTINEL|<script>bad/);
});

test('owner report excludes free text by default and includes it only explicitly', () => {
  const result = hospital.groupOwnerReportRecords([{ ...base, notes: 'INTERNAL_NOTE_SENTINEL' }], 'Europe/Moscow');
  assert.doesNotMatch(result[0].items[0], /INTERNAL_NOTE_SENTINEL/);
  const detailed = hospital.groupOwnerReportRecords([{ ...base, notes: 'INTERNAL_NOTE_SENTINEL' }], 'Europe/Moscow', true);
  assert.match(detailed[0].items[0], /INTERNAL_NOTE_SENTINEL/);
});

test('box sheet defaults to identity only; explicit option includes assignments and paper checkboxes', () => {
 let html;
 const module = loadPrintModule('hospital/hospitalPrint.ts', value => { html = value; });
 const stay = { animal: { nickname: 'ТЕСТ кот' }, owner: { fullName: 'ТЕСТ владелец' },
  hospitalBox: { name: 'Бокс 2' }, diagnoses: [{ title: 'ТЕСТ диагноз' }],
  hospitalRecords: [{ ...base, title: 'MEDICATION_SENTINEL', recordType: 'MEDICATION', recordedAt: new Date().toISOString() }] };
 module.printHospitalBoxSheet(stay);
 assert.match(html, /ТЕСТ кот/); assert.match(html, /ТЕСТ владелец/); assert.match(html, /ТЕСТ диагноз/); assert.match(html, /Бокс 2/);
 assert.doesNotMatch(html, /MEDICATION_SENTINEL|<h1>Назначения|<input class="paper-check"/);
 module.printHospitalBoxSheet(stay, undefined, true);
 assert.match(html, /MEDICATION_SENTINEL/); assert.match(html, /<h1>Назначения/); assert.match(html, /class="paper-check" type="checkbox"/);
});
