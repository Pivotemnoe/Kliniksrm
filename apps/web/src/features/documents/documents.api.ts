import { apiRequest } from '../../api/client';
import {
  CreateDocumentTemplateInput,
  CreateVisitDocumentInput,
  DocumentTemplate,
  UpdateDocumentTemplateInput,
  UpdateVisitDocumentInput,
  VisitDocument,
} from './types';

export function listDocumentTemplates() {
  return apiRequest<DocumentTemplate[]>('/v1/document-templates');
}

export function createDocumentTemplate(input: CreateDocumentTemplateInput) {
  return apiRequest<DocumentTemplate>('/v1/document-templates', {
    method: 'POST',
    body: input,
  });
}

export function updateDocumentTemplate(templateId: string, input: UpdateDocumentTemplateInput) {
  return apiRequest<DocumentTemplate>(`/v1/document-templates/${templateId}`, {
    method: 'PATCH',
    body: input,
  });
}

export function listVisitDocuments(visitId: string) {
  return apiRequest<VisitDocument[]>(`/v1/visits/${visitId}/documents`);
}

export function createVisitDocument(visitId: string, input: CreateVisitDocumentInput) {
  return apiRequest<VisitDocument>(`/v1/visits/${visitId}/documents`, {
    method: 'POST',
    body: input,
  });
}

export function updateVisitDocument(visitId: string, documentId: string, input: UpdateVisitDocumentInput) {
  return apiRequest<VisitDocument>(`/v1/visits/${visitId}/documents/${documentId}`, {
    method: 'PATCH',
    body: input,
  });
}
