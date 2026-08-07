import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { buildDirectorPortalStatistics } = require('../apps/api/dist/modules/dashboard/portal-statistics.js');

test('директорская статистика считает только реальную активацию, а не выданный QR-код', () => {
  const statistics = buildDirectorPortalStatistics({
    totalOwners: 14_106,
    now: new Date('2026-08-06T10:00:00.000Z'),
    today: {
      date: '2026-08-06',
      start: new Date('2026-08-05T21:00:00.000Z'),
      end: new Date('2026-08-06T20:59:59.999Z'),
      invitationsCreated: 4,
    },
    localOwners: [
      portalOwner('owner-1', { status: 'INVITED' }),
      portalOwner('owner-2', { status: 'INVITED', invitedAt: '2026-08-05T10:00:00.000Z' }),
      portalOwner('owner-3', { status: 'BLOCKED', lastLoginAt: '2026-06-01T10:00:00.000Z', maxLinked: true }),
      portalOwner('owner-4', { status: 'DISABLED' }),
      portalOwner('owner-5', { status: 'DISABLED' }),
    ],
    gateway: {
      generatedAt: '2026-08-06T09:59:00.000Z',
      owners: [
        {
          ownerId: 'owner-1',
          activatedAt: '2026-08-06T08:00:00.000Z',
          lastSeenAt: '2026-08-06T09:00:00.000Z',
          telegramLinked: true,
          maxLinked: false,
        },
        {
          ownerId: 'owner-5',
          activatedAt: '2026-08-02T10:00:00.000Z',
          lastSeenAt: '2026-08-04T10:00:00.000Z',
          telegramLinked: false,
          maxLinked: false,
        },
      ],
    },
  });

  assert.equal(statistics.gatewayAvailable, true);
  assert.deepEqual(statistics.today, {
    date: '2026-08-06',
    invitationsCreated: 4,
    activated: 1,
    activeOwners: 1,
  });
  assert.equal(statistics.totals.owners, 14_106);
  assert.equal(statistics.totals.registered, 3);
  assert.equal(statistics.totals.invited, 1);
  assert.equal(statistics.totals.active30Days, 2);
  assert.equal(statistics.totals.telegramLinked, 1);
  assert.equal(statistics.totals.maxLinked, 1);
  assert.equal(statistics.totals.blocked, 1);
  assert.equal(statistics.listedOwners, 4);
  assert.equal(statistics.items.find((item) => item.ownerId === 'owner-1')?.status, 'ACTIVATED');
  assert.equal(statistics.items.find((item) => item.ownerId === 'owner-2')?.registered, false);
  assert.equal(statistics.items.some((item) => item.ownerId === 'owner-4'), false);
});

test('без публичного шлюза сохраняются локальные показатели и явный признак неполных данных', () => {
  const statistics = buildDirectorPortalStatistics({
    totalOwners: 2,
    now: new Date('2026-08-06T10:00:00.000Z'),
    today: {
      date: '2026-08-06',
      start: new Date('2026-08-05T21:00:00.000Z'),
      end: new Date('2026-08-06T20:59:59.999Z'),
      invitationsCreated: 2,
    },
    localOwners: [portalOwner('owner-1', { status: 'ENABLED', lastLoginAt: '2026-08-06T09:00:00.000Z' })],
    gateway: null,
  });

  assert.equal(statistics.gatewayAvailable, false);
  assert.equal(statistics.gatewayUpdatedAt, null);
  assert.equal(statistics.totals.registered, 1);
  assert.equal(statistics.totals.active30Days, 1);
  assert.equal(statistics.today.invitationsCreated, 2);
  assert.equal(statistics.today.activated, 1);
  assert.equal(statistics.today.activeOwners, 1);
});

test('карточка личных кабинетов находится только в директорской сводке и объясняет методику подсчёта', async () => {
  const dashboard = await readFile(new URL('../apps/web/src/features/dashboard/DashboardPage.tsx', import.meta.url), 'utf8');
  assert.match(dashboard, /summary\?\.workspace\.mode === 'director'/);
  assert.match(dashboard, /title="Личные кабинеты"/);
  assert.match(dashboard, /Активированным считается кабинет, в который владелец хотя бы один раз успешно вошёл/);
  assert.match(dashboard, /Публичный шлюз сейчас недоступен/);
  assert.match(dashboard, /Приглашений создано сегодня/);
  assert.match(dashboard, /Активировали сегодня/);
  assert.match(dashboard, /Заходили сегодня/);
});

test('карточка владельца отличает созданное приглашение от фактического входа', async () => {
  const ownerCommunication = await readFile(
    new URL('../apps/web/src/features/owners/OwnerCommunicationTab.tsx', import.meta.url),
    'utf8',
  );
  assert.match(ownerCommunication, /Приглашение создано, владелец ещё не вошёл/);
  assert.match(ownerCommunication, /Владелец вошёл в личный кабинет/);
  assert.match(ownerCommunication, /gatewayStatus\?\.activatedAt/);
  assert.match(ownerCommunication, /gatewayStatus\?\.lastSeenAt/);
});

function portalOwner(ownerId, overrides = {}) {
  return {
    ownerId,
    fullName: `Владелец ${ownerId}`,
    phone: '+70000000000',
    status: 'DISABLED',
    invitedAt: null,
    lastLoginAt: null,
    telegramLinked: false,
    maxLinked: false,
    ...overrides,
  };
}
