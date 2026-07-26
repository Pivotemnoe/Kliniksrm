import { Injectable } from '@nestjs/common';
import { readFile, statfs } from 'node:fs/promises';
import { dirname } from 'node:path';

type BackupStatusFile = {
  state?: 'ok' | 'failed' | 'running';
  lastDatabaseBackupAt?: string | null;
  lastFilesBackupAt?: string | null;
  lastIntegrityCheckAt?: string | null;
  lastRestoreTestAt?: string | null;
  lastRestoreTestState?: 'ok' | 'failed' | null;
  lastError?: string | null;
  databaseArchive?: string | null;
  filesArchive?: string | null;
  databaseBytes?: number | null;
  filesBytes?: number | null;
  freeBytes?: number | null;
  totalBytes?: number | null;
  diskMeasuredAt?: string | null;
};

@Injectable()
export class BackupsService {
  async getStatus() {
    const statusFile = process.env.BACKUP_STATUS_FILE || '/backups/status.json';
    const staleHours = positiveNumber(process.env.BACKUP_STALE_HOURS, 36);
    const filesStaleHours = positiveNumber(process.env.BACKUP_FILES_STALE_HOURS, 192);
    const integrityStaleHours = positiveNumber(process.env.BACKUP_INTEGRITY_STALE_HOURS, 48);
    const restoreTestStaleDays = positiveNumber(process.env.BACKUP_RESTORE_TEST_STALE_DAYS, 30);
    const lowSpaceGb = positiveNumber(process.env.BACKUP_LOW_SPACE_GB, 20);
    const lowSpacePercent = positiveNumber(process.env.BACKUP_LOW_SPACE_PERCENT, 20);
    let status: BackupStatusFile = {};
    let statusReadable = true;
    try {
      status = JSON.parse(await readFile(statusFile, 'utf8')) as BackupStatusFile;
    } catch {
      statusReadable = false;
    }

    let freeBytes = validDiskBytes(status.freeBytes);
    let totalBytes = validDiskBytes(status.totalBytes);
    if (freeBytes === null || totalBytes === null) {
      try {
        const stats = await statfs(dirname(statusFile));
        freeBytes = Number(stats.bavail) * Number(stats.bsize);
        totalBytes = Number(stats.blocks) * Number(stats.bsize);
      } catch {
        // The backup volume may not be mounted in development.
      }
    }

    const lastDatabaseAt = parseDate(status.lastDatabaseBackupAt);
    const lastFilesAt = parseDate(status.lastFilesBackupAt);
    const lastIntegrityAt = parseDate(status.lastIntegrityCheckAt);
    const lastRestoreTestAt = parseDate(status.lastRestoreTestAt);
    const databaseAgeHours = ageHours(lastDatabaseAt);
    const filesAgeHours = ageHours(lastFilesAt);
    const integrityAgeHours = ageHours(lastIntegrityAt);
    const restoreTestAgeHours = ageHours(lastRestoreTestAt);
    const warnings: string[] = [];
    if (!statusReadable) warnings.push('Служба резервных копий ещё не записала отчёт');
    if (databaseAgeHours === null || databaseAgeHours > staleHours) warnings.push('Свежая копия базы данных не найдена');
    if (filesAgeHours === null || filesAgeHours > filesStaleHours) warnings.push('Свежая копия документов и фотографий не найдена');
    if (integrityAgeHours === null || integrityAgeHours > integrityStaleHours) warnings.push('Целостность архивов давно не проверялась');
    if (restoreTestAgeHours === null) {
      warnings.push('Проверка восстановления ещё не выполнялась');
    } else if (restoreTestAgeHours > restoreTestStaleDays * 24) {
      warnings.push('Проверка восстановления устарела');
    }
    if (freeBytes !== null && freeBytes < lowSpaceGb * 1024 ** 3) {
      warnings.push('На диске резервных копий заканчивается место');
    } else if (freeBytes !== null && totalBytes !== null && totalBytes > 0 && freeBytes / totalBytes * 100 < lowSpacePercent) {
      warnings.push(`На диске резервных копий свободно меньше ${lowSpacePercent}%`);
    }
    if (status.state === 'failed') warnings.push(status.lastError || 'Последнее резервирование завершилось ошибкой');
    if (status.lastRestoreTestState === 'failed') warnings.push('Последняя проверка восстановления не пройдена');

    return {
      state: warnings.length ? 'warning' : 'ok',
      storage: process.env.BACKUP_STORAGE_LABEL || 'Папка резервных копий',
      lastDatabaseBackupAt: status.lastDatabaseBackupAt ?? null,
      lastFilesBackupAt: status.lastFilesBackupAt ?? null,
      lastIntegrityCheckAt: status.lastIntegrityCheckAt ?? null,
      lastRestoreTestAt: status.lastRestoreTestAt ?? null,
      lastRestoreTestState: status.lastRestoreTestState ?? null,
      databaseBytes: status.databaseBytes ?? null,
      filesBytes: status.filesBytes ?? null,
      freeBytes,
      totalBytes,
      diskMeasuredAt: status.diskMeasuredAt ?? null,
      warnings,
      schedule: {
        database: 'ежедневно',
        files: 'еженедельно и после существенных изменений',
        dailyRetentionDays: positiveNumber(process.env.BACKUP_DAILY_RETENTION_DAYS, 14),
        weeklyRetentionDays: positiveNumber(process.env.BACKUP_WEEKLY_RETENTION_DAYS, 56),
        monthlyRetentionDays: positiveNumber(process.env.BACKUP_MONTHLY_RETENTION_DAYS, 365),
      },
    };
  }
}

function validDiskBytes(value?: number | null) {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : null;
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function ageHours(value: Date | null) {
  return value ? (Date.now() - value.getTime()) / 3_600_000 : null;
}

function positiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
