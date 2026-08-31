import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('карта стационара печатает отдельный внутренний лист для бокса', async () => {
  const [card, print] = await Promise.all([
    read('apps/web/src/features/hospital/HospitalCardPage.tsx'),
    read('apps/web/src/features/hospital/hospitalPrint.ts'),
  ]);

  assert.match(card, /printHospitalBoxSheet/);
  assert.match(card, />Лист для бокса<\/Button>/);
  assert.match(card, />Отчёт владельцу \/ PDF<\/Button>/);
  assert.match(print, /export function printHospitalBoxSheet/);
  assert.match(print, /@page \{ size: A5 portrait; margin: 6mm; \}/);
  assert.match(print, /Внутренний лист стационара — не для клиента/);
  assert.match(print, /Бокс \/ место/);
  assert.match(print, /Причина помещения/);
  assert.match(print, /Состояние пациента/);
  assert.match(print, /Ответственный/);
  assert.match(print, /Назначения и выполнения/);
  assert.match(print, /recordStatus === 'PLANNED' \|\| record\.recordStatus === 'COMPLETED'/);
  assert.match(print, /recordStatus === 'PLANNED' &&/);
  assert.match(print, /groupHospitalBoxAssignments/);
  assert.match(print, /class="paper-check" type="checkbox"/);
  assert.match(print, /occurrence\.status === 'COMPLETED' \? ' checked' : ''/);
  assert.match(print, /факт\. время \/ инициалы/);
  assert.match(print, /record\.billItem\?\.productId/);
  assert.match(print, /record\.billItem\?\.serviceId/);
  assert.match(print, /Бумажная отметка не заменяет запись выполнения в CRM/);
  assert.doesNotMatch(print, /stay\.owner\?\.phone/);
});

test('заголовок карты стационара не сжимается по буквам на рабочем ноутбуке', async () => {
  const styles = await read('apps/web/src/styles.css');

  assert.match(styles, /@media \(max-width: 1500px\)[\s\S]*?\.hospital-card-page \.page-header \{[\s\S]*?flex-direction: column;/);
  assert.match(styles, /\.hospital-card-page \.page-header h2 \{[\s\S]*?overflow-wrap: normal;[\s\S]*?word-break: normal;/);
  assert.match(styles, /\.hospital-card-page \.page-header-extra > \.ant-space \{[\s\S]*?flex-wrap: wrap;/);
});
