export type FileAttachment = {
  id: string;
  originalName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  checksumSha256: string | null;
  purpose: 'MEDICAL_DOCUMENT' | 'LABORATORY_RESULT' | 'SUPPLY_DOCUMENT';
  uploadedById: string | null;
  uploadedBy: { id: string; fullName: string } | null;
  createdAt: string;
};
