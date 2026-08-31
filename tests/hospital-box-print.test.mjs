import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('карта стационара печатает отдельный внутренний лист для бокса', async () => {
  const [card, print, hospitalService] = await Promise.all([
    read('apps/web/src/features/hospital/HospitalCardPage.tsx'),
    read('apps/web/src/features/hospital/hospitalPrint.ts'),
    read('apps/api/src/modules/hospital/hospital.service.ts'),
  ]);

  assert.match(card, /printHospitalBoxSheet/);
  assert.match(card, />Лист для бокса<\/Button>/);
  assert.match(card, />Отчёт владельцу \/ PDF<\/Button>/);
  assert.match(print, /export function printHospitalBoxSheet/);
  assert.match(print, /@page \{ size: A5 portrait; margin: 7mm; \}/);
  assert.match(print, /Номер бокса/);
  assert.match(print, /ФИО владельца/);
  assert.match(print, /Кличка животного/);
  assert.match(print, /Диагноз животного/);
  assert.match(print, /stay\.diagnoses\?\.map/);
  assert.match(print, /Назначения на \$\{escapeHtml\(sheetDate\)\}/);
  assert.match(print, /recordStatus === 'PLANNED' \|\| record\.recordStatus === 'COMPLETED'/);
  assert.match(print, /dateKey\(new Date\(record\.recordedAt\), timeZone\) === dateKey\(now, timeZone\)/);
  assert.match(print, /groupHospitalBoxAssignments/);
  assert.match(print, /class="paper-check" type="checkbox"/);
  assert.match(print, /occurrence\.status === 'COMPLETED' \? ' checked' : ''/);
  assert.match(print, /class="assignment-time"/);
  assert.match(print, /body \{[^}]*font: 15px\/1\.3 Arial/);
  assert.match(print, /\.assignment-title \{[^}]*font-size: 16px/);
  assert.doesNotMatch(print, /stay\.owner\?\.phone/);

  const boxSheetSource = print.split('export function printHospitalBoxSheet')[1].split('type OwnerReportGroup')[0];
  assert.doesNotMatch(boxSheetSource, /Причина помещения|Состояние пациента|Ответственный|Назначил:|количество|факт\. время|completion:|patient-details/);
  assert.match(hospitalService, /diagnoses: stay\.sourceVisit\.diagnoses/);
});

test('заголовок карты стационара не сжимается по буквам на рабочем ноутбуке', async () => {
  const styles = await read('apps/web/src/styles.css');

  assert.match(styles, /@media \(max-width: 1500px\)[\s\S]*?\.hospital-card-page \.page-header \{[\s\S]*?flex-direction: column;/);
  assert.match(styles, /\.hospital-card-page \.page-header h2 \{[\s\S]*?overflow-wrap: normal;[\s\S]*?word-break: normal;/);
  assert.match(styles, /\.hospital-card-page \.page-header-extra > \.ant-space \{[\s\S]*?flex-wrap: wrap;/);
});
