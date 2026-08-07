import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const require = createRequire(import.meta.url);
const { StaffAlertsService } = require('../apps/api/dist/modules/staff-alerts/staff-alerts.service.js');
const { InternalMessagesService } = require('../apps/api/dist/modules/internal-messages/internal-messages.service.js');

async function read(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('миграция оповещений и сообщений только добавляет новые таблицы', async () => {
  const [schema, migration] = await Promise.all([
    read('prisma/schema.prisma'),
    read('prisma/migrations/20260807000100_staff_alerts_internal_messages/migration.sql'),
  ]);

  assert.match(schema, /model StaffAlertRead/);
  assert.match(schema, /@@id\(\[employeeId, alertKey\]\)/);
  assert.match(schema, /model InternalMessage/);
  assert.match(schema, /@relation\("InternalMessageSender"/);
  assert.match(schema, /@relation\("InternalMessageRecipient"/);
  assert.match(migration, /CREATE TABLE "StaffAlertRead"/);
  assert.match(migration, /CREATE TABLE "InternalMessage"/);
  assert.doesNotMatch(migration, /^\s*(?:DROP|TRUNCATE|DELETE\s+FROM|UPDATE\s+[^\s]+\s+SET)\b/im);
  assert.doesNotMatch(migration, /ALTER TABLE "(?:Owner|Animal|Visit|Bill|Product|StockBatch)"/);
});

test('врач получает только свои незавершённые приёмы и не получает склад при одном праве чтения', async () => {
  let productQueryCount = 0;
  const prisma = {
    visit: {
      findMany: async ({ where }) => {
        assert.equal(where.employeeId, 'doctor-1');
        assert.equal(where.hospitalBoxId, null);
        return [unfinishedVisit];
      },
    },
    product: { findMany: async () => { productQueryCount += 1; return []; } },
    staffAlertRead: { findMany: async () => [] },
  };
  const service = new StaffAlertsService(prisma, { log: async () => undefined });

  const result = await service.list(actor({
    id: 'doctor-1',
    roles: ['doctor'],
    permissions: ['visits.read', 'stock.read'],
  }));

  assert.equal(productQueryCount, 0);
  assert.equal(result.unreadTotal, 1);
  assert.equal(result.items[0].kind, 'UNFINISHED_VISIT');
  assert.equal(result.items[0].href, '/visits/visit-1');
  assert.match(result.items[0].title, /Незавершённый приём/);
});

test('низкий остаток доступен сотруднику, который управляет складом', async () => {
  const prisma = {
    employeeWarehouseAccess: { findMany: async () => [{ warehouseId: 'warehouse-1' }] },
    product: {
      findMany: async ({ select }) => {
        assert.ok(select.batches.where.warehouseId.in.includes('warehouse-1'));
        return [{
          id: 'product-1',
          title: 'Азитробел',
          minStock: 2,
          updatedAt: new Date('2026-08-07T05:00:00.000Z'),
          batches: [{ rest: 1, updatedAt: new Date('2026-08-07T05:00:00.000Z') }],
        }];
      },
    },
    staffAlertRead: { findMany: async () => [] },
  };
  const service = new StaffAlertsService(prisma, { log: async () => undefined });

  const result = await service.list(actor({ permissions: ['stock.manage'] }));

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].kind, 'LOW_STOCK');
  assert.equal(result.items[0].count, 1);
});

test('переписка выбирает только сообщения между текущим и выбранным сотрудником', async () => {
  let capturedWhere;
  const prisma = {
    employee: { findUnique: async () => ({ id: 'employee-2' }) },
    internalMessage: {
      findMany: async ({ where }) => {
        capturedWhere = where;
        return [];
      },
    },
  };
  const service = new InternalMessagesService(prisma, { log: async () => undefined });

  await service.listThread({ employeeId: 'employee-2', limit: '25' }, 'employee-1');

  assert.deepEqual(capturedWhere, {
    OR: [
      { senderId: 'employee-1', recipientId: 'employee-2' },
      { senderId: 'employee-2', recipientId: 'employee-1' },
    ],
  });
});

test('текст личного сообщения не попадает в журнал аудита', async () => {
  let auditEntry;
  const prisma = {
    employee: { findFirst: async () => ({ id: 'employee-2' }) },
    internalMessage: {
      create: async ({ data }) => ({
        id: 'message-1',
        ...data,
        readAt: null,
        createdAt: new Date('2026-08-07T05:00:00.000Z'),
        sender: staffEmployee('employee-1', 'Врач 1'),
        recipient: staffEmployee('employee-2', 'Врач 2'),
      }),
    },
  };
  const service = new InternalMessagesService(prisma, { log: async (entry) => { auditEntry = entry; } });

  const result = await service.send({ recipientId: 'employee-2', body: '  Внутреннее сообщение  ' }, 'employee-1');

  assert.equal(result.body, 'Внутреннее сообщение');
  assert.equal(auditEntry.metadata.recipientId, 'employee-2');
  assert.equal(auditEntry.metadata.length, 'Внутреннее сообщение'.length);
  assert.equal(Object.hasOwn(auditEntry.metadata, 'body'), false);
  assert.equal(JSON.stringify(auditEntry).includes('Внутреннее сообщение'), false);
});

test('колокольчик показывает выбор непросмотренных событий, а сообщения открывают сотрудников', async () => {
  const [layout, popover, dashboard, messages, routes] = await Promise.all([
    read('apps/web/src/layouts/CrmLayout.tsx'),
    read('apps/web/src/features/staffAlerts/StaffAlertsPopover.tsx'),
    read('apps/web/src/features/dashboard/DashboardPage.tsx'),
    read('apps/web/src/features/internalMessages/StaffMessagesPage.tsx'),
    read('apps/web/src/app/routes.tsx'),
  ]);

  assert.match(layout, /<StaffAlertsPopover \/>/);
  assert.doesNotMatch(layout, /headerAlertTarget/);
  assert.match(popover, /Непросмотренные оповещения/);
  assert.match(popover, /unreadItems\.map/);
  assert.match(popover, /navigate\(item\.href\)/);
  assert.match(dashboard, /Незавершённые приёмы/);
  assert.match(dashboard, /Мои незавершённые приёмы/);
  assert.match(messages, /Выберите сотрудника/);
  assert.match(messages, /Сообщения сотрудникам/);
  assert.match(routes, /path: '\/staff-messages'/);
});

const unfinishedVisit = {
  id: 'visit-1',
  status: 'IN_PROGRESS',
  startedAt: new Date('2026-08-07T04:00:00.000Z'),
  updatedAt: new Date('2026-08-07T05:00:00.000Z'),
  owner: { fullName: 'Владелец' },
  animal: { nickname: 'Лео' },
  employee: { fullName: 'Врач' },
};

function actor(overrides = {}) {
  return {
    id: 'employee-1',
    userId: 'user-1',
    fullName: 'Сотрудник',
    phone: null,
    position: null,
    defaultRoute: null,
    restrictLoginToShifts: false,
    status: 'ACTIVE',
    roles: [],
    permissions: [],
    ...overrides,
  };
}

function staffEmployee(id, fullName) {
  return {
    id,
    fullName,
    position: 'Врач',
    status: 'ACTIVE',
    roles: [{ role: { code: 'doctor', title: 'Врач' } }],
  };
}
