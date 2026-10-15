import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
import { buildPreventionSnapshot, preventionSettings, preventionMonthRange, previousPreventionMonth } from '../apps/api/dist/modules/reports/prevention-report-data.js';
import { renderPreventionDocx } from '../apps/api/dist/modules/reports/prevention-report-docx.js';
const row = (id, animalId, title, date = '2026-09-12T12:00:00Z', species = 'DOG', extra = {}) => ({ id, animalId, title, vaccinatedAt: date, vaccineSeries: 'QA-001', animal: { nickname: 'Пациент QA', species, owner: { fullName: 'Владелец <QA>', address: 'Адрес & QA' } }, reportDetails: { doseText: '1 доза (вымышленный тест)', administrationRoute: 'QA', usedDoses: 1, consumedDoses: 1, syringesAndNeedles: 'Одноразовые (тест)'  }, ...extra });
const build = (vaccinations, history = [], extra = {}) => buildPreventionSnapshot({ month: '2026-09', timezone: 'Europe/Moscow', clinic: { name: 'Клиника QA', legalName: 'ИП QA', address: 'Адрес QA', phone: '' }, settings: preventionSettings(null), vaccinations, history, cases: [], generatedAt: '2026-10-01T06:00:00Z', ...extra });
const count = (r, species, code, stage = 'PRIMARY') => r.summary.find(s => s.species === species).rows.find(s => s.code === code && s.stage === stage).count;
test('no history is primary; history matches infections and patient, not just drug names', () => {
  const r = build([row('current', 'a', 'Дипентавак 1 доза')], [row('old', 'a', 'Рабикс', '2025-09-12T12:00:00Z'), row('other', 'b', 'Дипентавак', '2025-01-01T12:00:00Z')]);
  assert.equal(count(r, 'DOG', 'RABIES', 'REVACCINATION'), 1); assert.equal(count(r, 'DOG', 'RABIES'), 0);
  assert.equal(count(r, 'DOG', 'CANINE_COMPLEX'), 1); assert.equal(count(r, 'DOG', 'LEPTOSPIROSIS'), 1); assert.equal(count(r, 'DOG', 'PARAINFLUENZA'), 0);
});
test('history in same month counts, later and same-time vaccinations do not make a first one secondary', () => {
  const r = build([row('first', 'a', 'Рабикс', '2026-09-01T10:00:00Z'), row('next', 'a', 'Рабикс', '2026-09-22T10:00:00Z')]);
  assert.equal(r.rows[0].stages.RABIES, 'PRIMARY'); assert.equal(r.rows[1].stages.RABIES, 'REVACCINATION');
});
test('Asterion without R excludes rabies; exact RL aliases include rabies; unknown variant remains reviewable', () => {
  const r = build([row('1', '1', 'Астерион DHPPIL'), row('2', '2', 'Астерион DHPPI + RL'), row('3', '3', 'Мультифел', undefined, 'CAT')]);
  assert.equal(count(r, 'DOG', 'RABIES'), 1); assert.equal(count(r, 'DOG', 'PARAINFLUENZA'), 2); assert.equal(count(r, 'CAT', 'CHLAMYDIOSIS'), null);
  assert.equal(r.status, 'NEEDS_REVIEW'); assert.equal(build([row('4', '4', 'Мультифел-4', undefined, 'CAT')]).status, 'READY');
});
test('explicit stage and composition override inference; unknown dose and consumption never become invented values', () => {
  const r = build([row('1', '1', 'Неизвестная вакцина', undefined, 'CAT', { reportDetails: { stage: 'REVACCINATION', diseases: ['RABIES'] } })]);
  assert.equal(count(r, 'CAT', 'RABIES', 'REVACCINATION'), 1); assert.equal(r.acts[0].usedDoses, null); assert.equal(r.acts[0].doseText, ''); assert.equal(r.status, 'NEEDS_REVIEW');
});
test('calendar month respects clinic timezone, leap year, DST and previous year', () => {
  assert.equal(preventionMonthRange('2026-09', 'Europe/Moscow').start.toISOString(), '2026-08-31T21:00:00.000Z');
  assert.equal(preventionMonthRange('2024-02', 'Europe/Moscow').to, '2024-02-29');
  assert.equal(preventionMonthRange('2026-03', 'Europe/Amsterdam').end.toISOString(), '2026-03-31T22:00:00.000Z');
  assert.equal(previousPreventionMonth(new Date('2026-12-31T22:00:00Z'), 'Europe/Moscow'), '2026-12');
  assert.throws(() => preventionMonthRange('2026-13', 'Europe/Moscow'));
});
test('illness summary counts unique primary patients with confirmed clinical diagnoses', () => {
  const r = build([], [], { cases: [
    { animalId: 'a', species: 'DOG', diagnoses: [{ title: 'Бабезиоз', diagnosisType: 'Клинический' }] },
    { animalId: 'a', species: 'DOG', diagnoses: [{ title: 'Пироплазмоз', diagnosisType: 'Окончательный' }] },
    { animalId: 'b', species: 'CAT', diagnoses: [{ title: 'Клинически здоров', diagnosisType: 'Клинический' }] },
    { animalId: 'c', species: 'CAT', diagnoses: [{ title: 'Панлейкопения', diagnosisType: 'Предварительный' }] },
    { animalId: 'd', species: 'CAT', diagnoses: [{ title: 'Калицивироз', diagnosisType: 'Окончательный', status: 'Не подтвержден' }] },
  ] });
  assert.equal(r.illness.total, 1); assert.equal(r.illness.conditions.find(c => c.title === 'Бабезиоз').count, 1);
});
test('source Word package preserves logo, relationships, styles and section; XML safely escapes source values', () => {
  const source = unzipSync(readFileSync('apps/api/assets/reports/prevention-reference.docx'));
  const output = unzipSync(renderPreventionDocx(build([row('1', '1', 'Рабикс')])));
  assert.deepEqual(Object.keys(output).sort(), Object.keys(source).sort());
  for (const key of Object.keys(source).filter(k => k !== 'word/document.xml')) assert.deepEqual(output[key], source[key], key);
  const xml = strFromU8(output['word/document.xml']); const srcXml = strFromU8(source['word/document.xml']);
  assert.equal(xml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/)[0], srcXml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/)[0]);
  assert.ok(xml.includes('Владелец &lt;QA&gt;')); assert.ok(xml.includes('Адрес &amp; QA')); assert.ok(xml.includes('А К Т'));
  assert.ok(!xml.includes('25.01.2026')); assert.ok(xml.includes('01.09.2026')); assert.ok(xml.includes('30.09.2026')); assert.ok(xml.includes('<w:cantSplit/>'));
});
