import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const require = createRequire(import.meta.url);
const projectRoot = new URL('../', import.meta.url);
async function read(path) { return readFile(new URL(path, projectRoot), 'utf8'); }

test('офлайн-лицензия проверяется подписью и привязана к серверу', () => {
  const { canonicalLicensePayload, offlineLicenseFormat, parseAndVerifyOfflineLicense, resolveLicenseMode } = require('../apps/api/dist/modules/support/license-verifier.js');
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const payload = {
    licenseId: 'license-1', customer: 'Клиника', installationId: 'installation-1', hostFingerprint: 'f'.repeat(64),
    issuedAt: '2026-07-26T00:00:00.000Z', validUntil: '2027-07-26T00:00:00.000Z', features: ['crm'], maxOffices: 1,
  };
  const canonical = canonicalLicensePayload(payload);
  const document = JSON.stringify({
    format: offlineLicenseFormat,
    payload: Buffer.from(canonical).toString('base64url'),
    signature: sign(null, Buffer.from(canonical), privateKey).toString('base64url'),
  });
  assert.deepEqual(parseAndVerifyOfflineLicense(document, publicKey), payload);
  const tampered = JSON.stringify({ ...JSON.parse(document), payload: Buffer.from(JSON.stringify({ ...payload, customer: 'Чужая клиника' })).toString('base64url') });
  assert.throws(() => parseAndVerifyOfflineLicense(tampered, publicKey), /Подпись/);
  assert.equal(resolveLicenseMode({}), 'compatibility');
  assert.equal(resolveLicenseMode({ TEMICHEVVET_LICENSE_MODE: 'required' }), 'required');
});

test('миграция этапов 5-6 только добавляет служебные таблицы и права директора', async () => {
  const migration = await read('prisma/migrations/20260726000300_support_license_acceptance/migration.sql');
  for (const table of ['ClinicInstallation', 'SupportRequest', 'ServerAcceptance']) assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
  for (const permission of ['support.read', 'support.manage', 'license.manage', 'acceptance.manage']) assert.match(migration, new RegExp(permission.replace('.', '\\.')));
  assert.match(migration, /WHERE role\."code" = 'director'/);
  assert.doesNotMatch(migration, /\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b/i);
  assert.doesNotMatch(migration, /ALTER TABLE "(?:Owner|Animal|Visit|Bill|Payment|StockBatch|FileObject)"/);
});

test('диагностика требует отдельного согласия и не экспортирует персональные поля', async () => {
  const [controller, service, page] = await Promise.all([
    read('apps/api/src/modules/support/support.controller.ts'),
    read('apps/api/src/modules/support/support.service.ts'),
    read('apps/web/src/features/support/SupportPage.tsx'),
  ]);
  assert.match(controller, /DiagnosticConsentDto/);
  assert.match(service, /containsNames: false/);
  assert.match(service, /containsMedicalTexts: false/);
  assert.match(service, /containsSecrets: false/);
  assert.doesNotMatch(service, /audit\.exportReport/);
  assert.match(page, /В пакет не входят ФИО, телефоны, адреса, тексты приёмов и сообщений/);
  assert.match(page, /Действие будет записано в журнал аудита/);
});

test('коммерческий режим блокирует рабочие API, но оставляет вход и установку лицензии', async () => {
  const guard = await read('apps/api/src/modules/support/license.guard.ts');
  assert.match(guard, /\/api\/v1\/auth/);
  assert.match(guard, /\/api\/v1\/support/);
  assert.match(guard, /assertLicensed/);
  const compose = await read('docker-compose.yml');
  assert.match(compose, /TEMICHEVVET_LICENSE_MODE/);
  assert.match(compose, /TEMICHEVVET_HOST_FINGERPRINT/);
  const launcher = await read('scripts/start-clinic-server.ps1');
  assert.match(launcher, /MachineGuid/);
  assert.match(launcher, /TEMICHEVVET_HOST_FINGERPRINT/);
});

test('образы получают аттестацию, а флешка проверяет SHA-256 до docker load', async () => {
  const [workflow, creator, windows, linux, mac] = await Promise.all([
    read('.github/workflows/publish-docker-images.yml'), read('scripts/create-portable-flash.sh'),
    read('scripts/portable/install-windows.ps1'), read('scripts/portable/install-linux.sh'), read('scripts/portable/install-mac.sh'),
  ]);
  assert.match(workflow, /attestations: write/);
  assert.match(workflow, /actions\/attest@v4/g);
  assert.match(workflow, /subject-digest: \$\{\{ steps\.build-api\.outputs\.digest \}\}/);
  assert.match(creator, /temichevvet-images\.tar\.sha256/);
  assert.match(creator, /RELEASE-MANIFEST\.txt/);
  assert.ok(windows.indexOf('Assert-ImagesArchiveChecksum') < windows.indexOf('@("load", "--input", $ImagesTar)'));
  assert.ok(linux.indexOf('sha256sum -c') < linux.indexOf('docker load --input'));
  assert.ok(mac.indexOf('shasum -a 256 -c') < mac.indexOf('docker load --input'));
});

test('финальная приёмка сверяет расширенный набор и не удаляет volumes', async () => {
  const [exportScript, restore, page, service] = await Promise.all([
    read('scripts/export-clinic-transfer.ps1'), read('scripts/restore-clinic-transfer.ps1'), read('apps/web/src/features/support/SupportPage.tsx'), read('apps/api/src/modules/support/support.service.ts'),
  ]);
  for (const field of ['employees', 'tasks', 'visitDocuments', 'suppliers', 'supplyInvoices', 'payrollPeriods', 'businessEntries', 'supportRequests']) {
    assert.match(exportScript, new RegExp(`''${field}''`));
    assert.match(restore, new RegExp(`"${field}"`));
  }
  assert.match(restore, /reportFormat = "temichevvet-restore-report-v1"/);
  assert.match(restore, /archiveSha256 = \$actualHash/);
  assert.match(restore, /sampleChecksPending = \$true/);
  assert.match(restore, /oldServerRetained = \$true/);
  assert.match(service, /report\.reportFormat !== acceptanceReportFormat/);
  assert.match(service, /report\.oldServerRetained !== true \|\| report\.dockerVolumesDeleted !== false/);
  assert.match(page, /Старый компьютер и Docker volumes не удалять/);
  assert.doesNotMatch(restore, /docker\s+(?:volume\s+rm|compose\s+down\s+-v)/i);
});
