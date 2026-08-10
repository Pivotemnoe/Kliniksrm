import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const require = createRequire(import.meta.url);

test('плавающая услуга выбирает цену только внутри включительного диапазона', () => {
  const { resolveServiceUnitPrice } = require('../apps/api/dist/modules/stock/service-pricing.js');
  const { Prisma } = require('@prisma/client');
  const service = {
    id: 'service-1',
    title: 'Процедура',
    price: new Prisma.Decimal(500),
    priceType: 'FLOATING',
    minimumPrice: new Prisma.Decimal(500),
    maximumPrice: new Prisma.Decimal(900),
  };

  assert.equal(resolveServiceUnitPrice(service), 500);
  assert.equal(resolveServiceUnitPrice(service, 500), 500);
  assert.equal(resolveServiceUnitPrice(service, 900), 900);
  assert.throws(() => resolveServiceUnitPrice(service, 499), /должна быть от 500 до 900/);
  assert.throws(() => resolveServiceUnitPrice(service, 901), /должна быть от 500 до 900/);
});

test('сегодняшняя вакцинация появляется ровно с 08:00 по Москве, просроченная видна раньше', () => {
  const { resolveVaccinationDues } = require('../apps/api/dist/modules/animals/vaccination-due.js');
  const items = [
    vaccination('today', '2026-08-06T21:00:00.000Z'),
    vaccination('overdue', '2026-08-05T21:00:00.000Z'),
  ];

  const beforeShift = resolveVaccinationDues(items, new Date('2026-08-07T04:59:00.000Z'));
  assert.deepEqual(beforeShift.today.map((item) => item.id), []);
  assert.deepEqual(beforeShift.overdue.map((item) => item.id), ['overdue']);

  const atShiftStart = resolveVaccinationDues(items, new Date('2026-08-07T05:00:00.000Z'));
  assert.deepEqual(atShiftStart.today.map((item) => item.id), ['today']);
  assert.deepEqual(atShiftStart.overdue.map((item) => item.id), ['overdue']);
});

test('временный пароль принуждает сотрудника задать свой и глобальные плашки доступны на всех маршрутах', async () => {
  const [schema, employees, auth, protectedRoute, layout, alerts] = await Promise.all([
    readFile('prisma/schema.prisma', 'utf8'),
    readFile('apps/api/src/modules/employees/employees.service.ts', 'utf8'),
    readFile('apps/api/src/modules/auth/auth.service.ts', 'utf8'),
    readFile('apps/web/src/app/ProtectedRoute.tsx', 'utf8'),
    readFile('apps/web/src/layouts/CrmLayout.tsx', 'utf8'),
    readFile('apps/web/src/layouts/GlobalOperationalAlerts.tsx', 'utf8'),
  ]);

  assert.match(schema, /mustChangePassword\s+Boolean\s+@default\(false\)/);
  assert.match(employees, /mustChangePassword: true/);
  assert.match(auth, /mustChangePassword: false/);
  assert.match(protectedRoute, /data\.employee\.mustChangePassword/);
  assert.match(layout, /<GlobalOperationalAlerts[\s\S]*?internalMessages=\{internalMessagesQuery\.data\}/);
  assert.match(alerts, /TODAY_VACCINATION/);
  assert.match(alerts, /OVERDUE_VACCINATION/);
  assert.match(alerts, /Показать полный список/);
});

function vaccination(id, expiresAt) {
  return {
    id,
    title: `Вакцина ${id}`,
    expiresAt: new Date(expiresAt),
    animal: { id: `animal-${id}` },
  };
}
