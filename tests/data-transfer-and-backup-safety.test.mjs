import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const projectRoot = new URL('../', import.meta.url);
const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);

async function read(relativePath) {
  return readFile(new URL(relativePath, projectRoot), 'utf8');
}

test('миграция переноса только добавляет журнал и не изменяет клинические таблицы', async () => {
  const migration = await read('prisma/migrations/20260725000100_data_transfer_batches/migration.sql');
  assert.match(migration, /CREATE TABLE "DataTransferBatch"/);
  assert.match(migration, /CREATE TABLE "DataTransferRow"/);
  assert.match(migration, /CREATE TABLE "DataTransferFieldMapping"/);
  assert.match(migration, /CREATE TABLE "DataTransferEntityLink"/);
  assert.doesNotMatch(migration, /\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b/i);
  assert.doesNotMatch(migration, /ALTER TABLE "(?:Owner|Animal|Visit|Bill|Payment|Product|FileObject)"/);
});

test('перенос на новый компьютер требует точного подтверждения и пустой целевой базы', async () => {
  const [restore, exportScript, restoreLauncher, exportLauncher] = await Promise.all([
    read('scripts/restore-clinic-transfer.ps1'),
    read('scripts/export-clinic-transfer.ps1'),
    read('scripts/portable/restore-transfer-windows.bat'),
    read('scripts/portable/export-transfer-windows.bat'),
  ]);
  assert.match(restore, /RESTORE_TO_NEW_COMPUTER/);
  for (const field of ['vaccinations', 'appointments', 'queueEntries', 'stockBatches', 'stockMovements', 'notifications']) {
    assert.match(restore, new RegExp(`"${field}"`));
    assert.match(exportScript, new RegExp(`''${field}''`));
  }
  assert.match(restore, /Существующая непустая клиническая база будет отклонена/);
  assert.match(restore, /nonEmptyTargetFields/);
  assert.match(restore, /minioCountMatches/);
  assert.match(restore, /Import-SourceApplicationSettings/);
  assert.match(restore, /target-before-transfer-/);
  assert.match(restore, /Get-BackupDirectory/);
  assert.match(restore, /redisRestored = \$false/);
  assert.match(restore, /Set-Location \$RootDir\.Path/);
  assert.match(restore, /\$countsQuery \| docker exec -i clinic-crm-postgres psql/);
  assert.match(exportScript, /\$countsQuery \| docker exec -i clinic-crm-postgres psql/);
  assert.doesNotMatch(restore, /psql[^\n]+-c \$countsQuery/);
  assert.doesNotMatch(exportScript, /psql[^\n]+-c \$countsQuery/);
  assert.match(restore, /function Invoke-DockerQuiet/);
  assert.match(restore, /Arguments @\("compose", "stop", "api", "web", "backup", "minio"\)/);
  assert.match(restore, /Get-MinIOUserFileCount/);
  assert.doesNotMatch(restore, /find \/data/);
  assert.match(restore, /if \(\$servicesStopped\)[\s\S]*"compose", "up"/);
  assert.match(restore, /Обнаружено ранее прерванное восстановление/);
  assert.match(restore, /resumeMismatches/);
  assert.match(restore, /Copy-Item -Force -Path \$targetEnvSnapshot -Destination \$EnvFile/);
  assert.match(restore, /if \(!\$resumeMode\)[\s\S]*pg_restore -U \$dbUser/);
  assert.doesNotMatch(restore, /Get-Content \$EnvFile -Raw/);
  assert.match(restore, /\[IO\.File\]::Copy\(\$tempEnvFile, \$EnvFile, \$true\)/);
  assert.doesNotMatch(restore, /\[IO\.File\]::Replace\(/);
  assert.match(exportScript, /pg_restore --list \/tmp\/temichevvet-transfer\.dump/);
  assert.match(exportScript, /temichevvet-computer-transfer-v2/);
  assert.match(restoreLauncher, /%USERPROFILE%\\TemichevVet\\scripts\\restore-clinic-transfer\.ps1/);
  assert.match(exportLauncher, /%USERPROFILE%\\TemichevVet\\scripts\\export-clinic-transfer\.ps1/);
  assert.match(restoreLauncher, /copy \/Y "%PORTABLE_SCRIPT%" "%INSTALLED_SCRIPT%"/);
  assert.match(restoreLauncher, /powershell[^\n]+-File "%INSTALLED_SCRIPT%"/);
  assert.doesNotMatch(exportLauncher, /%~dp0CRM\\scripts/);
  assert.doesNotMatch(restore, /docker\s+(?:volume\s+rm|compose\s+down\s+-v)/i);
});

test('резервирование разделяет ежедневную базу и еженедельные файлы', async () => {
  const backup = await read('scripts/backup-docker-loop.sh');
  assert.match(backup, /BACKUP_DATABASE_INTERVAL_SECONDS:-86400/);
  assert.match(backup, /BACKUP_FILES_INTERVAL_SECONDS:-604800/);
  assert.match(backup, /BACKUP_CHECK_INTERVAL_SECONDS:-300/);
  assert.match(backup, /BACKUP_HARD_STOP_GB:-5/);
  assert.match(backup, /temichevvet-db-daily/);
  assert.match(backup, /temichevvet-files-weekly/);
  assert.match(backup, /pg_restore --list/);
  assert.match(backup, /restore-test\.status/);
  assert.match(backup, /json_string_or_null/);
  assert.match(backup, /write_archive_checksum/);
  assert.match(backup, /BACKUP_STATUS_ONLY/);
  assert.match(backup, /BACKUP_INTEGRITY_INTERVAL_SECONDS:-86400/);
  assert.match(backup, /measure_backup_disk/);
  assert.match(backup, /verify_latest_archives/);
  assert.match(backup, /latest_archive/);
  assert.match(backup, /ensure_monthly_copy/);
  assert.match(backup, /if ! create_database_backup; then/);
  assert.match(backup, /cleanup_incomplete_backups/);
  assert.doesNotMatch(backup, /sed -i 's\/: ,\//);
  const verifier = await read('scripts/verify-backup.ps1');
  assert.match(verifier, /Контрольная сумма архива не совпала/);
  assert.match(verifier, /docker image inspect postgres:16-alpine/);
  assert.match(verifier, /kind=files/);
  assert.match(verifier, /kind=database/);
  assert.doesNotMatch(verifier, /docker\s+(?:volume\s+rm|compose\s+down\s+-v)/i);
  const storageConfig = await read('scripts/configure-backup-storage.ps1');
  assert.match(storageConfig, /Get-PhysicalDiskNumber/);
  assert.match(storageConfig, /тот же физический диск/);
});

test('пустой новый диск резервных копий получает корректный начальный статус', async () => {
  const backupDir = await mkdtemp(join(tmpdir(), 'temichevvet-backup-status-'));
  try {
    await execFileAsync('sh', ['scripts/backup-docker-loop.sh'], {
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, BACKUP_DIR: backupDir, BACKUP_STATUS_ONLY: 'true' },
    });
    const status = JSON.parse(await readFile(join(backupDir, 'status.json'), 'utf8'));
    assert.equal(status.state, 'ok');
    assert.equal(status.lastDatabaseBackupAt, null);
    assert.equal(status.lastFilesBackupAt, null);
    assert.equal(status.databaseBytes, 0);
    assert.equal(status.filesBytes, 0);
    assert.ok(status.freeBytes > 0);
    assert.ok(status.totalBytes >= status.freeBytes);
    assert.match(status.diskMeasuredAt, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    await rm(backupDir, { recursive: true, force: true });
  }
});

test('поиск дублей использует сильный идентификатор и откат проверяет новые связи', async () => {
  const service = await read('apps/api/src/modules/imports/data-transfer.service.ts');
  assert.match(service, /let ownerCandidates = phoneNormalized/);
  assert.match(service, /let animalCandidates = microchip/);
  assert.match(service, /const productCandidates = barcode/);
  assert.match(service, /firstFingerprintRow/);
  assert.match(service, /status: DataTransferRowStatus\.IMPORTED/);
  assert.match(service, /detectExistingMatches/);
  assert.match(service, /Микрочип уже привязан к пациенту другого владельца/);
  assert.match(service, /ProductCategory/);
  assert.match(service, /ServiceCategory/);
  for (const relation of ['tasks', 'sales', 'onlineRequests', 'weights', 'notifications']) {
    assert.match(service, new RegExp(`${relation}: \\{ take: 1`));
  }
  assert.match(service, /type === 'StockMovement'/);
  assert.match(service, /status: \{ in: \[DataTransferStatus\.PREVIEWED/);
  assert.match(service, /Эта партия уже обрабатывается другим запросом/);
  assert.match(service, /date\.getUTCDate\(\) !== day/);
  assert.match(service, /Некорректное числовое значение остатка/);
  assert.match(service, /where: \{ kind: \{ in: allowedKinds \} \}/);
  assert.match(service, /await tx\.dataTransferRow\.update/);
  assert.match(service, /where: \{ id: batch\.id, status: DataTransferStatus\.ROLLING_BACK \}/);
  assert.match(service, /owner_source_id/);
  assert.match(service, /animal_source_id/);
  assert.match(service, /extraPhone: clean\(row\.extra_phone\)/);
  assert.match(service, /status: clean\(row\.animal_status\)/);
  assert.match(service, /findEntitiesLinkedToOtherSourceIds/);
});

test('даты и числа переноса проверяются строго, без тихой нормализации', () => {
  const { parseDateTime, parseOptionalDecimal } = require('../apps/api/dist/modules/imports/data-transfer.service.js');
  assert.equal(parseDateTime('31.02.2026'), null);
  assert.equal(parseDateTime('2026-02-31'), null);
  assert.equal(parseDateTime('29.02.2024')?.toISOString(), '2024-02-29T00:00:00.000Z');
  assert.equal(parseDateTime('24.07.2026 10:30')?.toISOString(), '2026-07-24T07:30:00.000Z');
  assert.equal(parseDateTime('2026-07-24T10:30:00+03:00')?.toISOString(), '2026-07-24T07:30:00.000Z');
  assert.equal(parseOptionalDecimal('не число'), null);
  assert.equal(parseOptionalDecimal('1 234,50')?.toString(), '1234.5');
  assert.equal(parseOptionalDecimal('47.00 ₽')?.toString(), '47');
});

test('обновления Windows проверяют amd64 и сохраняют возврат только приложения', async () => {
  const [online, portable] = await Promise.all([
    read('scripts/update-clinic-server.ps1'),
    read('scripts/portable/install-windows.ps1'),
  ]);
  for (const script of [online, portable]) {
    assert.match(script, /linux\/amd64|amd64/);
    assert.match(script, /rollback-/);
    assert.match(script, /Docker volumes|Data volumes/);
    assert.doesNotMatch(script, /docker\s+(?:volume\s+rm|compose\s+down\s+-v)/i);
    assert.match(script, /потенциально разрушительн/);
    assert.match(script, /BACKUP_DIR_HOST/);
    assert.match(script, /finished_at IS NULL AND rolled_back_at IS NULL/);
    assert.match(script, /pg_restore --list/);
  }
  assert.match(portable, /Show-PendingInstalledMigrations/);
  assert.match(portable, /Создать комплект переноса TemichevVet\.cmd/);
  assert.match(portable, /Настроить отдельный диск резервных копий\.cmd/);
  assert.match(portable, /preflight_failed/);
  assert.match(portable, /Set-InstalledEnvDefault "TEMICHEVVET_AUTO_PULL_IMAGES"/);
  assert.ok(portable.indexOf('Цель действия:') < portable.indexOf('if (!(Test-DockerCommand -Arguments @("version")))'));
});

test('пользовательский экран переноса не содержит название сторонней CRM', async () => {
  const page = await read('apps/web/src/features/imports/VetafImportPage.tsx');
  assert.doesNotMatch(page, /Vet\.?AF|ВетАФ|VetAF/);
  assert.match(page, /Перенос данных/);
  assert.match(page, /Журнал переноса/);
  assert.match(page, /Отменить эту партию/);
  assert.match(page, /Строк, где владелец уже найден/);
});

test('проверочный переносной комплект можно собрать без секретов связи', async () => {
  const creator = await read('scripts/create-portable-flash.sh');
  assert.match(creator, /--skip-connectivity/);
  assert.match(creator, /SKIP_CONNECTIVITY="true"/);
  assert.ok(creator.indexOf('Цель действия: создать переносной комплект') < creator.indexOf('rm -rf "$TMP_DIR"'));
});

test('старый импорт без журнала больше не опубликован как API', async () => {
  const controller = await read('apps/api/src/modules/imports/imports.controller.ts');
  assert.doesNotMatch(controller, /vetaf\/(?:preview|commit)/i);
  assert.doesNotMatch(controller, /ImportsService/);
});

test('предпросмотр пропускает повтор строки внутри файла до записи в клинические таблицы', async () => {
  const { DataTransferService } = require('../apps/api/dist/modules/imports/data-transfer.service.js');
  const capturedRows = [];
  let batch;
  const prisma = {
    dataTransferBatch: { findUnique: async () => null },
    dataTransferRow: { findMany: async () => [] },
    owner: { findMany: async () => [] },
    animal: { findMany: async () => [] },
    vaccination: { findMany: async () => [] },
    $transaction: async (operation) => operation({
      dataTransferBatch: {
        create: async ({ data }) => {
          batch = { id: 'batch-1', ...data, createdAt: new Date('2026-07-25T00:00:00Z'), updatedAt: new Date('2026-07-25T00:00:00Z') };
          return batch;
        },
        findUniqueOrThrow: async () => ({ ...batch, fieldMappings: [{ sourceColumn: 'ФИО', targetField: 'owner_name' }] }),
      },
      dataTransferEntityLink: { deleteMany: async () => ({ count: 0 }) },
      dataTransferRow: {
        deleteMany: async () => ({ count: 0 }),
        createMany: async ({ data }) => { capturedRows.push(...data); return { count: data.length }; },
      },
      dataTransferFieldMapping: {
        deleteMany: async () => ({ count: 0 }),
        createMany: async () => ({ count: 1 }),
      },
    }),
  };
  const service = new DataTransferService(prisma, { log: async () => undefined });
  const result = await service.preview({
    kind: 'clients',
    sourceSystem: 'Тестовый экспорт',
    fileName: 'clients.csv',
    fileChecksum: 'a'.repeat(64),
    mappings: [{ sourceColumn: 'ФИО', targetField: 'owner_name' }],
    rows: [
      { rowNumber: 2, data: { 'ФИО': 'Иванов Иван' } },
      { rowNumber: 3, data: { 'ФИО': 'Иванов Иван' } },
    ],
  }, { id: 'director', permissions: ['owners.manage', 'animals.manage'] });
  assert.equal(result.readyRows, 1);
  assert.equal(result.skippedRows, 1);
  assert.equal(result.metadata.preview.repeatedRows, 1);
  assert.equal(capturedRows[1].status, 'SKIPPED');
});
