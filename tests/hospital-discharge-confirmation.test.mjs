import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('выписка из стационара требует повторного подтверждения после пяти секунд', async () => {
  const [confirmation, list, card] = await Promise.all([
    read('apps/web/src/features/hospital/HospitalDischargeButton.tsx'),
    read('apps/web/src/features/hospital/HospitalPage.tsx'),
    read('apps/web/src/features/hospital/HospitalCardPage.tsx'),
  ]);

  assert.match(confirmation, /const dischargeDelaySeconds = 5/);
  assert.match(confirmation, /disabled: secondsLeft > 0/);
  assert.match(confirmation, /Подтвердить через \$\{secondsLeft\} с/);
  assert.match(confirmation, /Оставить в стационаре/);
  assert.match(confirmation, /Проверьте пациента, назначения и выполненные действия/);
  assert.match(list, /<HospitalDischargeButton/);
  assert.match(card, /<HospitalDischargeButton/);
  assert.doesNotMatch(list, /actionMutation\.mutate\(\{ id: record\.id, action: 'discharge' \}\)/);
});
