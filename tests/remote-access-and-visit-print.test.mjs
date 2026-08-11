import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import remoteRequestModule from '../apps/api/dist/modules/remote-access/remote-request.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const require = createRequire(import.meta.url);
const { isRemoteGatewayRequest } = remoteRequestModule;
const { AuthService } = require('../apps/api/dist/modules/auth/auth.service.js');
const { RemoteAccessService } = require('../apps/api/dist/modules/remote-access/remote-access.service.js');
const { SessionAuthGuard } = require('../apps/api/dist/modules/auth/session-auth.guard.js');
const { SESSION_COOKIE_NAME } = require('../apps/api/dist/modules/auth/session-cookie.js');

test('печатный лист приёма использует реквизиты клиники и не раскрывает служебные данные', async () => {
  const source = await read('apps/web/src/features/visits/visitPrint.ts');

  assert.match(source, /organization\?\.displayName/);
  assert.match(source, /organization\.inn/);
  assert.match(source, /organization\.postalAddress \|\| organization\.legalAddress/);
  assert.match(source, /@page \{ size: A4; margin: 0; \}/);
  assert.match(source, /organization\?\.logoUrl \? new URL\(organization\.logoUrl, window\.location\.href\)\.href : null/);
  assert.match(source, /logo\.addEventListener\('load', printWhenReady/);
  assert.match(source, /logo\.parentElement\.remove\(\)/);
  assert.doesNotMatch(source, /src="\$\{escapeHtml\(appConfig\.logoUrl\)\}"/);
  assert.doesNotMatch(source, /<span>Напечатано<\/span>|<span>Напечатал<\/span>/);
  assert.doesNotMatch(source, /owner\.phone|owner\.extraPhone|<span>Телефон владельца<\/span>/);
  assert.doesNotMatch(source, /employee\?\.phone|doctorPhone|<span>Телефон врача<\/span>/);
  assert.match(source, /\.logo \{ display: block; width: 72px; height: 72px; object-fit: contain; \}/);
});

test('кличка пациента редактируется отдельной понятной командой и попадает в аудит', async () => {
  const [page, service] = await Promise.all([
    read('apps/web/src/features/animals/AnimalCardPage.tsx'),
    read('apps/api/src/modules/animals/animals.service.ts'),
  ]);

  assert.match(page, /Изменить кличку/);
  assert.match(page, /updateAnimal\(animalId!, \{ nickname: nextNickname\.trim\(\) \}\)/);
  assert.match(page, /hasPermission\(auth\?\.employee, 'animals\.manage'\)/);
  assert.match(service, /nickname: \{ from: currentAnimal\.nickname, to: dto\.nickname \}/);
});

test('организация загружает собственный логотип, а пустой логотип не печатается', async () => {
  const [service, controller, page, migration, print] = await Promise.all([
    read('apps/api/src/modules/organization/organization.service.ts'),
    read('apps/api/src/modules/organization/organization.controller.ts'),
    read('apps/web/src/features/organization/OrganizationSettingsPage.tsx'),
    read('prisma/migrations/20260801000200_organization_logo/migration.sql'),
    read('apps/web/src/features/visits/visitPrint.ts'),
  ]);

  assert.match(controller, /@Post\('logo'\)/);
  assert.match(controller, /@Delete\('logo'\)/);
  assert.match(service, /organization-logo\/\$\{organization\.id\}/);
  assert.match(service, /hasExpectedImageSignature/);
  assert.match(service, /5 \* 1024 \* 1024/);
  assert.match(page, /Загрузить логотип/);
  assert.match(page, /Если логотип не загружен, место под него на документе не показывается/);
  assert.match(print, /organization\?\.logoUrl/);
  assert.doesNotMatch(print, /<img class="logo" src="\$\{escapeHtml\(appConfig\.logoUrl\)\}/);
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM/i);
});

test('удалённый вход требует секретную отметку российского шлюза', () => {
  const previousSecret = process.env.REMOTE_ACCESS_GATEWAY_SECRET;
  const previousUrl = process.env.REMOTE_STAFF_PUBLIC_URL;
  process.env.REMOTE_ACCESS_GATEWAY_SECRET = 'test-secret-that-is-long-enough-for-validation';
  process.env.REMOTE_STAFF_PUBLIC_URL = 'https://staff.temichevvet.ru';

  try {
    assert.equal(isRemoteGatewayRequest({ headers: {} }), false);
    assert.throws(
      () => isRemoteGatewayRequest({ headers: { host: 'staff.temichevvet.ru' } }),
      /обязательную защитную отметку/,
    );
    assert.throws(
      () => isRemoteGatewayRequest({ headers: { 'x-temichevvet-remote-access': '1', 'x-temichevvet-gateway-secret': 'wrong' } }),
      /не прошёл проверку/,
    );
    assert.equal(
      isRemoteGatewayRequest({
        headers: {
          host: 'staff.temichevvet.ru',
          'x-temichevvet-remote-access': '1',
          'x-temichevvet-gateway-secret': process.env.REMOTE_ACCESS_GATEWAY_SECRET,
        },
      }),
      true,
    );
  } finally {
    if (previousSecret === undefined) delete process.env.REMOTE_ACCESS_GATEWAY_SECRET;
    else process.env.REMOTE_ACCESS_GATEWAY_SECRET = previousSecret;
    if (previousUrl === undefined) delete process.env.REMOTE_STAFF_PUBLIC_URL;
    else process.env.REMOTE_STAFF_PUBLIC_URL = previousUrl;
  }
});

test('одноразовое подключение не содержит открытого токена в базе и отзыв завершает сеансы', async () => {
  const [service, schema, migration] = await Promise.all([
    read('apps/api/src/modules/remote-access/remote-access.service.ts'),
    read('prisma/schema.prisma'),
    read('prisma/migrations/20260801000100_remote_director_access/migration.sql'),
  ]);

  assert.match(service, /randomBytes\(32\)/);
  assert.match(service, /tokenHash: hashToken\(token\)/);
  assert.match(service, /usedAt: null, revokedAt: null, expiresAt: \{ gt: new Date\(\) \}/);
  assert.match(service, /session\.deleteMany\(\{ where: \{ remoteDeviceId: deviceId \} \}\)/);
  assert.match(schema, /accessType\s+SessionAccessType\s+@default\(LOCAL\)/);
  assert.match(migration, /remote_access\.manage/);
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM "(Owner|Animal|Visit|Bill|Product)"/i);
});

test('директор может выбрать любого активного сотрудника, а администратор не видит управление удалённым доступом', async () => {
  let eligibleWhere;
  const prisma = {
    organization: { findFirst: async () => ({ id: 'organization-1', displayName: 'Клиника' }) },
    remoteAccessPolicy: { upsert: async () => ({ id: 'policy-1', organizationId: 'organization-1', enabled: true }) },
    remoteAccessDevice: { findMany: async () => [] },
    remoteAccessInvitation: { findMany: async () => [] },
    employee: {
      findMany: async ({ where }) => {
        eligibleWhere = where;
        return [{ id: 'doctor-1', fullName: 'Врач', position: 'Врач', roles: [{ role: { code: 'doctor', title: 'Врач' } }] }];
      },
    },
    auditLog: { findMany: async () => [] },
  };
  const service = new RemoteAccessService(prisma, { log: async () => undefined });
  const overview = await service.getOverview();

  assert.equal(eligibleWhere.status, 'ACTIVE');
  assert.deepEqual(eligibleWhere.userId, { not: null });
  assert.equal(Object.hasOwn(eligibleWhere, 'roles'), false);
  assert.equal(overview.eligibleEmployees[0].id, 'doctor-1');

  const [controller, access, settings, seed, migration] = await Promise.all([
    read('apps/api/src/modules/remote-access/remote-access.controller.ts'),
    read('apps/web/src/auth/access.ts'),
    read('apps/web/src/features/settings/SettingsOverviewPage.tsx'),
    read('prisma/seed.cjs'),
    read('prisma/migrations/20260810000300_staff_remote_read_only/migration.sql'),
  ]);
  assert.match(controller, /@RequireRoles\('director'\)/);
  assert.match(access, /roles: \['director'\]/);
  assert.match(settings, /roles: \['director'\]/);
  const administratorPermissions = seed.match(/'administrator',[\s\S]*?\n\s*\],\n\s*\[/)?.[0] ?? '';
  assert.doesNotMatch(administratorPermissions, /remote_access\.(?:read|manage)/);
  assert.match(migration, /DELETE FROM "RolePermission"/);
  assert.match(migration, /"code" = 'administrator'/);
});

test('удалённый просмотр вне смены не открывает локальный вход вне смены', async () => {
  let shiftChecks = 0;
  const service = new AuthService(
    { employeeShift: { findFirst: async () => { shiftChecks += 1; return null; } } },
    {},
    { log: async () => undefined },
  );
  const employee = { id: 'doctor-1', restrictLoginToShifts: true, allowRemoteOutsideShift: true };

  await service.assertEmployeeCanUseCrm(employee, 'auth.test', null, 'REMOTE');
  assert.equal(shiftChecks, 0);
  await assert.rejects(
    service.assertEmployeeCanUseCrm(employee, 'auth.test', null, 'LOCAL'),
    /нет активной смены/,
  );
  assert.equal(shiftChecks, 1);
});

test('удалённая сессия запрещает рабочие изменения сотрудникам, но разрешает их директору с отдельным аудитом', async () => {
  const [guard, decorator, messages, alerts, audit, news, migration] = await Promise.all([
    read('apps/api/src/modules/auth/session-auth.guard.ts'),
    read('apps/api/src/modules/auth/decorators/allow-remote-mutation.decorator.ts'),
    read('apps/api/src/modules/internal-messages/internal-messages.controller.ts'),
    read('apps/api/src/modules/staff-alerts/staff-alerts.controller.ts'),
    read('apps/api/src/modules/audit/audit.controller.ts'),
    read('apps/api/src/modules/news/news.controller.ts'),
    read('prisma/migrations/20260810000300_staff_remote_read_only/migration.sql'),
  ]);

  assert.match(guard, /session\.accessType === 'REMOTE' && isMutationMethod/);
  assert.match(guard, /remote_access\.write_blocked/);
  assert.match(guard, /roles\.includes\('director'\)/);
  assert.match(guard, /remote_access\.director_write/);
  assert.match(guard, /режиме просмотра/);
  assert.match(decorator, /ALLOW_REMOTE_MUTATION_KEY/);
  assert.match(messages, /@AllowRemoteMutation\(\)/);
  assert.match(alerts, /@AllowRemoteMutation\(\)/);
  assert.match(audit, /@AllowRemoteMutation\(\)/);
  assert.match(news, /@AllowRemoteMutation\(\)/);
  assert.match(migration, /ADD COLUMN "allowRemoteOutsideShift" BOOLEAN NOT NULL DEFAULT false/);
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM "(?:Owner|Animal|Visit|Bill|Product|StockBatch)"/i);
});

test('guard отклоняет удалённую запись врача, разрешает личные действия и отдельно аудирует запись директора', async () => {
  const auditEntries = [];
  let touched = 0;
  const session = remoteSessionFixture();
  let allowRemoteMutation = false;
  let serializedRoles = ['doctor'];
  const guard = new SessionAuthGuard(
    {
      getAllAndOverride: (key) => {
        if (key === 'isPublic') return false;
        if (key === 'allowRemoteMutation') return allowRemoteMutation;
        return undefined;
      },
    },
    {
      session: { findUnique: async () => session, deleteMany: async () => ({ count: 0 }) },
      remoteAccessDevice: { updateMany: async () => ({ count: 1 }) },
    },
    {
      hashSessionToken: () => 'session-1',
      assertEmployeeCanUseCrm: async () => undefined,
      serializeEmployee: () => ({ ...authEmployeeFixture(), roles: serializedRoles }),
      touchSession: async () => { touched += 1; },
    },
    { log: async (entry) => { auditEntries.push(entry); } },
  );
  const request = {
    headers: { cookie: `${SESSION_COOKIE_NAME}=token` },
    method: 'PATCH',
    originalUrl: '/api/v1/visits/visit-1',
    ip: '203.0.113.10',
  };
  const context = guardContext(request);

  await assert.rejects(guard.canActivate(context), /режиме просмотра/);
  assert.equal(touched, 0);
  assert.equal(auditEntries[0].action, 'remote_access.write_blocked');
  assert.equal(auditEntries[0].metadata.path, '/api/v1/visits/visit-1');

  allowRemoteMutation = true;
  request.originalUrl = '/api/v1/internal-messages';
  assert.equal(await guard.canActivate(context), true);
  assert.equal(touched, 1);

  allowRemoteMutation = false;
  serializedRoles = ['director'];
  request.originalUrl = '/api/v1/visits/visit-1';
  assert.equal(await guard.canActivate(context), true);
  assert.equal(touched, 2);
  assert.equal(auditEntries[1].action, 'remote_access.director_write');
  assert.equal(auditEntries[1].metadata.path, '/api/v1/visits/visit-1');
});

test('директор видит отдельную историю успешных удалённых входов', async () => {
  const [service, page, types] = await Promise.all([
    read('apps/api/src/modules/remote-access/remote-access.service.ts'),
    read('apps/web/src/features/remoteAccess/RemoteAccessSettingsPage.tsx'),
    read('apps/web/src/features/remoteAccess/types.ts'),
  ]);

  assert.match(service, /metadata: \{ path: \['accessType'\], equals: 'REMOTE' \}/);
  assert.match(service, /recentRemoteLogins:/);
  assert.match(page, /История удалённых входов/);
  assert.match(page, /loggedInAt/);
  assert.match(types, /recentRemoteLogins/);
});

test('внешний шлюз не хранит данные, а иностранный узел остаётся слепым TCP-транзитом', async () => {
  const [nginx, readme] = await Promise.all([
    read('deploy/staff-gateway/nginx-staff-https.conf.template'),
    read('deploy/staff-gateway/README.md'),
  ]);

  assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:23000/);
  assert.match(
    nginx,
    /location ~ \^\/api\/\(auth\/login\|v1\/remote-access\/enroll\)\$ \{[\s\S]*?proxy_pass http:\/\/127\.0\.0\.1:23000;[\s\S]*?proxy_http_version 1\.1;/,
  );
  assert.doesNotMatch(nginx, /include \/etc\/nginx\/proxy_params;/);
  assert.match(nginx, /X-TemichevVet-Remote-Access "1"/);
  assert.match(nginx, /__REMOTE_ACCESS_GATEWAY_SECRET__/);
  assert.match(nginx, /access_log off/);
  assert.match(readme, /не хранит медицинские данные/);
  assert.match(readme, /5\.129\.239\.104` используется только как слепой TCP-транзит/);
  assert.match(readme, /нет TLS-терминации, ключа внутреннего туннеля, базы, документов или журналов CRM/);
});

function guardContext(request) {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => request }),
  };
}

function authEmployeeFixture() {
  return {
    id: 'doctor-1',
    userId: 'user-1',
    fullName: 'Врач',
    phone: null,
    position: 'Врач',
    defaultRoute: '/visits',
    restrictLoginToShifts: false,
    allowRemoteOutsideShift: true,
    mustChangePassword: false,
    status: 'ACTIVE',
    roles: ['doctor'],
    permissions: ['visits.read', 'visits.manage'],
  };
}

function remoteSessionFixture() {
  return {
    id: 'session-1',
    userId: 'user-1',
    accessType: 'REMOTE',
    remoteDeviceId: 'device-1',
    expiresAt: new Date(Date.now() + 60_000),
    remoteDevice: {
      id: 'device-1',
      revokedAt: null,
      organization: { remoteAccessPolicy: { enabled: true, idleTimeoutMinutes: 30 } },
    },
    user: {
      mustChangePassword: false,
      employee: { ...authEmployeeFixture(), roles: [], permissionOverrides: [] },
    },
  };
}
