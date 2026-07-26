import { apiRequest } from '../../api/client';

export type HealthResponse = {
  status: string;
  service: string;
  database: string;
  timestamp: string;
};

export type MetaResponse = {
  name: string;
  version: string;
  revision?: string;
  buildDate?: string | null;
  imageSource?: string | null;
  modules: string[];
};

export function getHealth() {
  return apiRequest<HealthResponse>('/health');
}

export function getMeta() {
  return apiRequest<MetaResponse>('/v1/meta');
}

export type BackupStatusResponse = {
  state: 'ok' | 'warning';
  storage: string;
  lastDatabaseBackupAt: string | null;
  lastFilesBackupAt: string | null;
  lastIntegrityCheckAt: string | null;
  lastRestoreTestAt: string | null;
  lastRestoreTestState: 'ok' | 'failed' | null;
  databaseBytes: number | null;
  filesBytes: number | null;
  freeBytes: number | null;
  totalBytes: number | null;
  diskMeasuredAt: string | null;
  warnings: string[];
  schedule: {
    database: string;
    files: string;
    dailyRetentionDays: number;
    weeklyRetentionDays: number;
    monthlyRetentionDays: number;
  };
};

export function getBackupStatus() {
  return apiRequest<BackupStatusResponse>('/v1/backups/status');
}
