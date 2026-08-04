import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('расписание раскрывает дополнительные записи и смены по кнопке', async () => {
  const page = await read('apps/web/src/features/appointments/AppointmentsPage.tsx');

  assert.match(page, /const \[expandedDay, setExpandedDay\]/);
  assert.match(page, /const isExpanded = expandedDay === day\.value/);
  assert.match(page, /Ещё смен:/);
  assert.match(page, /Скрыть дополнительные/);
  assert.match(page, /aria-expanded=\{isExpanded\}/);
});

test('электронная очередь показывает отдельное состояние текущего приёма', async () => {
  const page = await read('apps/web/src/features/queue/QueuePage.tsx');

  assert.match(page, /title: 'Состояние приёма'/);
  assert.match(page, /visitStatusLabels\[record\.visit\.status\]/);
  assert.match(page, /getQueueDisplayStatus\(record\)/);
});

test('счёт управляется через единое меню действий', async () => {
  const page = await read('apps/web/src/features/billing/BillsPage.tsx');
  const api = await read('apps/web/src/features/billing/billing.api.ts');

  assert.match(page, /<Dropdown menu=\{\{ items: actionItems/);
  assert.match(page, /Действие/);
  assert.match(page, /label: 'Открыть'/);
  assert.match(page, /label: 'Оплатить'/);
  assert.match(page, /label: 'Отменить'/);
  assert.match(api, /export function cancelBill/);
});

test('сводка приёмов не маркирует всех пациентов как стационарных', async () => {
  const page = await read('apps/web/src/features/dashboard/DashboardPage.tsx');

  assert.match(page, /navigate\(`\/visits\/\$\{item\.id\}`\)/);
  assert.match(page, /visitStatusLabels\[item\.status\]/);
  assert.doesNotMatch(page, /navigate\(`\/hospital\/\$\{item\.id\}`\)[\s\S]{0,250}В стационаре/);
});
