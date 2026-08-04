export type DocumentStatus = 'DRAFT' | 'GENERATED' | 'SIGNED' | 'CANCELLED';

export type DocumentTemplateCategory = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type DocumentTemplate = {
  id: string;
  categoryId: string | null;
  category?: DocumentTemplateCategory | null;
  title: string;
  body: string | null;
  variables: Record<string, unknown> | null;
  currentVersion: number;
  versions?: Array<{
    id: string;
    version: number;
    publishedAt: string;
    createdByName: string | null;
  }>;
  createdAt: string;
  updatedAt: string;
};

export type VisitDocument = {
  id: string;
  visitId: string;
  templateId: string | null;
  template?: DocumentTemplate | null;
  templateVersionId: string | null;
  templateVersion?: {
    id: string;
    version: number;
    categoryTitle: string | null;
    title: string;
    publishedAt: string;
    createdByName: string | null;
  } | null;
  title: string;
  body: string | null;
  status: DocumentStatus;
  generatedDocument?: {
    id: string;
    title: string;
    status: DocumentStatus;
    snapshot: {
      schemaVersion: number;
      visitDocumentId: string;
      visitId: string;
      templateId: string | null;
      templateVersionId: string | null;
      title: string;
      body: string;
      clinicName: string;
      visitStartedAt: string;
      employeeName: string;
      ownerName: string;
      ownerPhone: string;
      animalName: string;
      animalDescription: string;
    } | null;
    contentSha256: string | null;
    pdfSha256: string | null;
    generatedByName: string | null;
    generatedAt: string | null;
    signedByName: string | null;
    signedAt: string | null;
    signatureMethod: 'PAPER' | 'ELECTRONIC' | 'STATUS_CONFIRMATION' | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  events: Array<{
    id: string;
    type: 'CREATED' | 'GENERATED' | 'SIGNED' | 'CANCELLED' | 'DELIVERY_QUEUED' | 'PRINTED';
    actorId: string | null;
    actorName: string | null;
    channel: string | null;
    details: Record<string, unknown> | null;
    createdAt: string;
  }>;
  deliveries: Array<{
    id: string;
    channel: string;
    recipient: string;
    status: string;
    attempts: number;
    scheduledAt: string;
    sentAt: string | null;
    lastError: string | null;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
};

export type CreateVisitDocumentInput = {
  templateId?: string;
  title?: string;
  body?: string;
  status?: DocumentStatus;
};

export type UpdateVisitDocumentInput = Partial<CreateVisitDocumentInput>;

export type CreateDocumentTemplateInput = {
  title: string;
  categoryTitle?: string;
  body?: string;
  variables?: Record<string, unknown>;
};

export type UpdateDocumentTemplateInput = Partial<CreateDocumentTemplateInput>;

export const documentStatusLabels: Record<DocumentStatus, string> = {
  DRAFT: 'Черновик',
  GENERATED: 'Сформирован',
  SIGNED: 'Подписан',
  CANCELLED: 'Отменён',
};

export const documentStatusColors: Record<DocumentStatus, string> = {
  DRAFT: 'default',
  GENERATED: 'blue',
  SIGNED: 'green',
  CANCELLED: 'red',
};
