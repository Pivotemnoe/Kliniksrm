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
  assert.match(print, /@page \{ size: A4 landscape; margin: 7mm; \}/);
  assert.match(print, /Внутренний лист стационара — не для клиента/);
  assert.match(print, /Бокс \/ место/);
  assert.match(print, /Причина помещения/);
  assert.match(print, /Состояние пациента/);
  assert.match(print, /Ответственный/);
  assert.match(print, /Назначения, ожидающие выполнения/);
  assert.match(print, /recordStatus === 'PLANNED'/);
  assert.match(print, /groupHospitalBoxAssignments/);
  assert.match(print, /class="paper-check"/);
  assert.match(print, /время \/ инициалы/);
  assert.match(print, /Бумажная отметка не заменяет запись выполнения в CRM/);
  assert.doesNotMatch(print, /stay\.owner\?\.phone/);
});
