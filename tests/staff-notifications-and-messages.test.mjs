import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const require = createRequire(import.meta.url);
const { StaffAlertsService } = require('../apps/api/dist/modules/staff-alerts/staff-alerts.service.js');
const { VisitOverdueAlertTrackerService } = require('../apps/api/dist/modules/staff-alerts/visit-overdue-alert-tracker.service.js');
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
        assert.equal(where.status, 'IN_PROGRESS');
        assert.ok(where.startedAt.lt instanceof Date);
        assert.equal(Object.hasOwn(where.startedAt, 'lte'), false);
        assert.ok(Date.now() - where.startedAt.lt.getTime() >= 59 * 60_000);
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
  assert.equal(result.items[0].severity, 'error');
  assert.match(result.items[0].description, /В работе \d+ ч \d+ мин/);
});

test('приём в работе менее часа не попадает в колокольчик', async () => {
  const recentlyStarted = new Date(Date.now() - 20 * 60_000);
  const prisma = {
    visit: {
      findMany: async ({ where }) => recentlyStarted < where.startedAt.lt ? [unfinishedVisit] : [],
    },
    staffAlertRead: { findMany: async () => [] },
  };
  const service = new StaffAlertsService(prisma, { log: async () => undefined });

  const result = await service.list(actor({
    id: 'doctor-1',
    roles: ['doctor'],
    permissions: ['visits.read'],
  }));

  assert.equal(result.items.length, 0);
  assert.equal(result.unreadTotal, 0);
});

test('переход порога часа один раз создаёт событие и системную запись аудита', async () => {
  let alertData;
  let auditData;
  const prisma = {
    visit: {
      findMany: async ({ where }) => {
        assert.equal(where.status, 'IN_PROGRESS');
        assert.equal(where.overdueAlert, null);
        return [unfinishedVisit];
      },
    },
    $transaction: async (callback) => callback({
      visitOverdueAlert: {
        create: async ({ data }) => {
          alertData = data;
          return { id: 'overdue-alert-1', ...data };
        },
      },
      auditLog: {
        create: async ({ data }) => {
          auditData = data;
          return { id: 'audit-1', ...data };
        },
      },
    }),
  };
  const service = new VisitOverdueAlertTrackerService(prisma);
  const result = await service.syncNow(new Date('2026-08-07T06:00:00.000Z'));

  assert.equal(result.status, 'synced');
  assert.equal(result.created, 1);
  assert.equal(alertData.visitId, 'visit-1');
  assert.equal(alertData.thresholdMinutes, 60);
  assert.equal(alertData.overdueAt.toISOString(), '2026-08-07T05:00:00.000Z');
  assert.equal(auditData.action, 'visit.overdue_alert');
  assert.equal(auditData.entityType, 'Visit');
  assert.equal(auditData.entityId, 'visit-1');
  assert.equal(auditData.metadata.thresholdMinutes, 60);
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

test('колокольчик, глобальная красная плашка, аудит и отчёты показывают просрочку более часа', async () => {
  const [layout, popover, operationalAlerts, messages, routes] = await Promise.all([
    read('apps/web/src/layouts/CrmLayout.tsx'),
    read('apps/web/src/features/staffAlerts/StaffAlertsPopover.tsx'),
    read('apps/web/src/layouts/GlobalOperationalAlerts.tsx'),
    read('apps/web/src/features/internalMessages/StaffMessagesPage.tsx'),
    read('apps/web/src/app/routes.tsx'),
  ]);

  assert.match(layout, /<StaffAlertsPopover \/>/);
  assert.match(layout, /<GlobalOperationalAlerts \/>/);
  assert.doesNotMatch(layout, /headerAlertTarget/);
  assert.match(popover, /Непросмотренные оповещения/);
  assert.match(popover, /unreadItems\.map/);
  assert.match(popover, /navigate\(item\.href\)/);
  assert.match(operationalAlerts, /dashboard-overdue-banner/);
  assert.match(operationalAlerts, /Незавершённые приёмы/);
  assert.match(operationalAlerts, /Более часа:/);
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
