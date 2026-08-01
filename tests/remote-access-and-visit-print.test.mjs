import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import remoteRequestModule from '../apps/api/dist/modules/remote-access/remote-request.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const { isRemoteGatewayRequest } = remoteRequestModule;

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

test('внешний шлюз является транзитным и не использует иностранный сервер', async () => {
  const [nginx, readme] = await Promise.all([
    read('deploy/staff-gateway/nginx-staff-https.conf.template'),
    read('deploy/staff-gateway/README.md'),
  ]);

  assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:23000/);
  assert.match(nginx, /X-TemichevVet-Remote-Access "1"/);
  assert.match(nginx, /__REMOTE_ACCESS_GATEWAY_SECRET__/);
  assert.match(readme, /не хранит медицинские данные/);
  assert.match(readme, /5\.129\.239\.104` не используется/);
});
