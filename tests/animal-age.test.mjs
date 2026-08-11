import assert from 'node:assert/strict';
import test from 'node:test';
import { formatAnimalAge } from '../apps/web/src/shared/utils/animalBirthDate.ts';

const referenceDate = new Date(2026, 7, 11);

test('animal age is formatted consistently for years, months and days', () => {
  assert.equal(formatAnimalAge('2020-05-10', referenceDate), '6 лет 3 месяца');
  assert.equal(formatAnimalAge('2025-08-11', referenceDate), '1 год');
  assert.equal(formatAnimalAge('2024-08-11', referenceDate), '2 года');
  assert.equal(formatAnimalAge('2021-08-11', referenceDate), '5 лет');
  assert.equal(formatAnimalAge('2020-01-01', referenceDate), '6 лет');
  assert.equal(formatAnimalAge('2026-01-01', referenceDate), 'меньше года');
  assert.equal(formatAnimalAge('2026-07-20', referenceDate), '22 дня');
});

test('animal age uses a safe placeholder when the birth date is unavailable or invalid', () => {
  assert.equal(formatAnimalAge(null, referenceDate), '—');
  assert.equal(formatAnimalAge('not-a-date', referenceDate), '—');
  assert.equal(formatAnimalAge('2026-08-12', referenceDate), '—');
});
