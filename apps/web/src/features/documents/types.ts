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
  createdAt: string;
  updatedAt: string;
};

export type VisitDocument = {
  id: string;
  visitId: string;
  templateId: string | null;
  template?: DocumentTemplate | null;
  title: string;
  body: string | null;
  status: DocumentStatus;
  generatedDocument?: {
    id: string;
    title: string;
    status: DocumentStatus;
    createdAt: string;
    updatedAt: string;
  } | null;
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
