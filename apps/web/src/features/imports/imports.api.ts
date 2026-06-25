import { apiRequest } from '../../api/client';

export type VetafImportKind = 'clients' | 'stock';

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

export type VetafImportSummary = {
  totalRows: number;
  validRows: number;
  errorRows: number;
  ownersCreated: number;
  ownersUpdated: number;
  animalsCreated: number;
  productsCreated: number;
  productsUpdated: number;
  stockBatchesCreated: number;
  skippedRows: number;
};

export type VetafImportResult = {
  kind: VetafImportKind;
  mode: 'preview' | 'commit';
  summary: VetafImportSummary;
  issues: VetafImportIssue[];
  samples: Array<Record<string, string | number | null>>;
};

export function previewVetafImport(kind: VetafImportKind, rows: VetafImportRow[]) {
  return apiRequest<VetafImportResult>('/v1/imports/vetaf/preview', { method: 'POST', body: { kind, rows } });
}

export function commitVetafImport(kind: VetafImportKind, rows: VetafImportRow[]) {
  return apiRequest<VetafImportResult>('/v1/imports/vetaf/commit', { method: 'POST', body: { kind, rows } });
}
