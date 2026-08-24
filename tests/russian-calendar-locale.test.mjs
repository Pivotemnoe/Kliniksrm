import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import dayjs from 'dayjs';
import localeData from 'dayjs/plugin/localeData.js';
import 'dayjs/locale/ru.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('все календари используют российскую неделю с понедельника', async () => {
  const [main, shifts] = await Promise.all([
    read('apps/web/src/main.tsx'),
    read('apps/web/src/features/appointments/EmployeeShiftsPanel.tsx'),
  ]);

  assert.match(main, /import 'dayjs\/locale\/ru';/);
  assert.match(main, /dayjs\.locale\('ru'\);/);

  dayjs.extend(localeData);
  dayjs.locale('ru');
  assert.equal(dayjs.localeData().firstDayOfWeek(), 1);

  assert.match(shifts, /\['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'\]/);
  assert.match(shifts, /\(start\.getDay\(\) \+ 6\) % 7/);
});
