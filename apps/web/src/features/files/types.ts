export type FileAttachment = {
  id: string;
  originalName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  checksumSha256: string | null;
  archiveCategory: PatientArchiveCategory | null;
  documentDate: string | null;
  sourceLabel: string | null;
  note: string | null;
  purpose: 'MEDICAL_DOCUMENT' | 'LABORATORY_RESULT' | 'SUPPLY_DOCUMENT';
  uploadedById: string | null;
  uploadedBy: { id: string; fullName: string } | null;
  createdAt: string;
};

export const patientArchiveCategories = [
  'История лечения',
  'Анализы',
  'Заключения',
  'Согласия',
  'Выписки',
  'Изображения',
  'Прочее',
] as const;

export type PatientArchiveCategory = (typeof patientArchiveCategories)[number];

export type PatientArchiveMetadata = {
  archiveCategory?: PatientArchiveCategory;
  documentDate?: string;
  sourceLabel?: string;
  note?: string;
};

export type PatientArchiveBatchResult = {
  uploaded: FileAttachment[];
  duplicates: Array<{ originalName: string; existingFileId: string }>;
  failed: Array<{ originalName: string; message: string }>;
};

export type PatientArchiveQuery = {
  search?: string;
  category?: PatientArchiveCategory;
  dateFrom?: string;
  dateTo?: string;
};
