import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';

const source = await readFile('apps/web/src/features/staffAlerts/presentation.ts', 'utf8');
const compiled = await transform(source, { loader: 'ts', format: 'cjs' });
const module = { exports: {} };
new Function('module', 'exports', compiled.code)(module, module.exports);
const { presentStaffAlerts } = module.exports;
const item = (key, kind, extra = {}) => ({ key, kind, title: key, description: 'Владелец Анна · пациент Лео', count: 1,
  occurredAt: '2026-10-19T08:00:00Z', severity: 'warning', unread: true, href: '/visits/one', version: '1', readAt: null, ...extra });

test('every authorized event appears in exactly one group and input is unchanged', () => {
  const kinds = ['UNFINISHED_VISIT', 'TODAY_VACCINATION', 'OVERDUE_VACCINATION', 'FAILED_DELIVERY', 'ONLINE_REQUEST', 'UNPAID_BILL', 'BILL_OVERPAYMENT', 'PREVENTION_REPORT', 'LOW_STOCK', 'NEWS', 'DIRECTOR_BRIEFING'];
  const items = kinds.map((kind, i) => item(String(i), kind));
  const before = structuredClone(items);
  const visible = presentStaffAlerts(items, 'all').flatMap(group => group.items);
  assert.deepEqual(visible.map(event => event.key).sort(), items.map(event => event.key).sort());
  assert.equal(new Set(visible.map(event => event.key)).size, kinds.length);
  assert.deepEqual(items, before);
});

test('viewing an overdue clinical event does not remove unfinished work', () => {
  const groups = presentStaffAlerts([item('read-visit', 'UNFINISHED_VISIT', { unread: false }), item('read-vaccine', 'OVERDUE_VACCINATION', { unread: false })], 'action');
  assert.equal(groups.flatMap(group => group.items).length, 2);
  assert.equal(groups.reduce((total, group) => total + group.unread, 0), 0);
});

test('work and information filters partition events without losing them', () => {
  const items = [item('visit', 'UNFINISHED_VISIT'), item('briefing', 'DIRECTOR_BRIEFING'), item('news', 'NEWS'), item('report', 'PREVENTION_REPORT')];
  const work = presentStaffAlerts(items, 'action').flatMap(group => group.items);
  const information = presentStaffAlerts(items, 'information').flatMap(group => group.items);
  assert.deepEqual(work.map(event => event.key).sort(), ['report', 'visit']);
  assert.deepEqual(information.map(event => event.key).sort(), ['briefing', 'news']);
  assert.equal(work.length + information.length, items.length);
});

test('oldest unfinished visit is first; urgent groups precede general warnings', () => {
  const groups = presentStaffAlerts([item('stock', 'LOW_STOCK'), item('newer', 'UNFINISHED_VISIT', { severity: 'error' }),
    item('oldest', 'UNFINISHED_VISIT', { severity: 'error', occurredAt: '2026-10-18T08:00:00Z' })], 'action');
  assert.equal(groups[0].id, 'visits');
  assert.deepEqual(groups[0].items.map(event => event.key), ['oldest', 'newer']);
});

test('search matches Russian owner or patient names without changing record counts', () => {
  const event = item('bill', 'UNPAID_BILL', { count: 107 });
  const groups = presentStaffAlerts([event, item('other', 'LOW_STOCK', { description: 'Другие данные' })], 'all', '  АННА ');
  assert.equal(groups.length, 1);
  assert.equal(groups[0].items[0].count, 107);
  assert.equal(groups[0].unread, 1);
  assert.deepEqual(presentStaffAlerts([event], 'all', 'нет совпадений'), []);
});
