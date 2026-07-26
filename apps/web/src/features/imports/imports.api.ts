import { apiRequest } from '../../api/client';

export type VetafImportRow = {
  rowNumber: number;
  data: Record<string, string>;
};

export type VetafImportIssue = {
  rowNumber: number;
  level: 'error' | 'warning';
  message: string;
  field?: string;
};

export type DataTransferKind = 'clients' | 'history' | 'catalog' | 'stock';

export type DataTransferMapping = {
  sourceColumn: string;
  targetField: string;
};

export type DataTransferBatch = {
  id: string;
  sourceSystem: string;
  kind: DataTransferKind;
  originalFileName: string | null;
  fileChecksum: string;
  status: string;
  totalRows: number;
  readyRows: number;
  importedRows: number;
  skippedRows: number;
  failedRows: number;
  startedAt: string | null;
  completedAt: string | null;
  rolledBackAt: string | null;
  errorSummary: string | null;
  metadata: {
    issues?: VetafImportIssue[];
    samples?: Array<Record<string, string | number | null>>;
    preview?: {
      matchedRecords?: number;
      matchedByType?: Record<string, number>;
      repeatedRows?: number;
    };
    commit?: { createdRecords?: number; matchedRecords?: number; errors?: VetafImportIssue[] };
  } | null;
  mappings: DataTransferMapping[];
  createdAt: string;
  updatedAt: string;
  canCommit: boolean;
  canRollback: boolean;
  repeatProtected?: boolean;
};

export type DataTransferTargetField = { value: string; label: string; required?: boolean };

export type DataTransferListResponse = {
  targetFields: Record<DataTransferKind, DataTransferTargetField[]>;
  batches: DataTransferBatch[];
};

export function getDataTransfers() {
  return apiRequest<DataTransferListResponse>('/v1/imports/transfers');
}

export function previewDataTransfer(body: {
  kind: DataTransferKind;
  sourceSystem: string;
  fileName: string;
  fileChecksum: string;
  rows: VetafImportRow[];
  mappings: DataTransferMapping[];
}) {
  return apiRequest<DataTransferBatch>('/v1/imports/transfers/preview', { method: 'POST', body });
}

export function commitDataTransfer(batchId: string) {
  return apiRequest<DataTransferBatch>(`/v1/imports/transfers/${batchId}/commit`, { method: 'POST' });
}

export function rollbackDataTransfer(batchId: string) {
  return apiRequest<DataTransferBatch>(`/v1/imports/transfers/${batchId}/rollback`, { method: 'POST' });
}
