import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { resolveVaccinationDues, groupVaccinationDues } = require('../apps/api/dist/modules/animals/vaccination-due.js');
const now = new Date('2026-09-24T07:00:00Z');
const vaccine = (id, animal, title, date) => ({ id, title, expiresAt: new Date(date), animal: { id: animal, nickname: 'Лео', owner: { id: 'owner', fullName: 'Тест' } } });
test('rabies and viral vaccines due for one animal produce one task with both vaccines', () => {
 const tasks = groupVaccinationDues(resolveVaccinationDues([
  vaccine('rabies', 'a', 'Бешенство', '2026-09-23'), vaccine('viral', 'a', 'Вирусные инфекции', '2026-09-24')
 ], now));
 assert.equal(tasks.length, 1); assert.equal(tasks[0].overdue, true);
 assert.deepEqual(tasks[0].vaccines.map(v => v.id), ['rabies', 'viral']);
});
test('animals with identical names and same owner remain distinct tasks', () => {
 const tasks = groupVaccinationDues(resolveVaccinationDues([
  vaccine('a1', 'a', 'Бешенство', '2026-09-24'), vaccine('b1', 'b', 'Бешенство', '2026-09-24')
 ], now));
 assert.deepEqual(tasks.map(t => t.animal.id), ['a', 'b']);
});
test('newer revaccination removes old due vaccine but retains other due vaccines', () => {
 const tasks = groupVaccinationDues(resolveVaccinationDues([
  vaccine('new', 'a', 'Бешенство', '2027-09-24'), vaccine('old', 'a', 'Бешенство', '2026-09-23'),
  vaccine('viral', 'a', 'Вирусные инфекции', '2026-09-24')
 ], now));
 assert.equal(tasks.length, 1); assert.equal(tasks[0].overdue, false);
 assert.deepEqual(tasks[0].vaccines.map(v => v.id), ['viral']);
});
