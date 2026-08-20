import { apiDownload, apiRequest, apiUpload, apiUploadMany } from '../../api/client';
import { buildQuery } from '../../shared/utils/query';
import { FileAttachment, PatientArchiveBatchResult, PatientArchiveMetadata, PatientArchiveQuery } from './types';

export function listVisitFiles(visitId: string) {
  return apiRequest<FileAttachment[]>(`/v1/files/visits/${visitId}`);
}

export function uploadVisitFile(visitId: string, file: File) {
  return apiUpload<FileAttachment>(`/v1/files/visits/${visitId}`, file);
}

export function listAnimalFiles(animalId: string, query: PatientArchiveQuery = {}) {
  return apiRequest<FileAttachment[]>(`/v1/files/animals/${animalId}${buildQuery(query)}`);
}

export function uploadAnimalFile(animalId: string, file: File, metadata: PatientArchiveMetadata = {}) {
  return apiUpload<FileAttachment>(`/v1/files/animals/${animalId}`, file, metadataFields(metadata));
}

export function uploadAnimalFilesBatch(animalId: string, files: File[], metadata: PatientArchiveMetadata = {}) {
  return apiUploadMany<PatientArchiveBatchResult>(`/v1/files/animals/${animalId}/batch`, files, metadataFields(metadata));
}

export function updateAnimalArchiveMetadata(fileId: string, metadata: PatientArchiveMetadata) {
  return apiRequest<FileAttachment>(`/v1/files/${fileId}/archive`, { method: 'PATCH', body: metadata });
}

export function listLaboratoryFiles(orderId: string, itemId: string) {
  return apiRequest<FileAttachment[]>(`/v1/files/laboratory/orders/${orderId}/items/${itemId}`);
}

export function uploadLaboratoryFile(orderId: string, itemId: string, file: File) {
  return apiUpload<FileAttachment>(`/v1/files/laboratory/orders/${orderId}/items/${itemId}`, file);
}

export function listLaboratoryOrderFiles(orderId: string) {
  return apiRequest<FileAttachment[]>(`/v1/files/laboratory/orders/${orderId}`);
}

export function uploadLaboratoryOrderFile(orderId: string, file: File) {
  return apiUpload<FileAttachment>(`/v1/files/laboratory/orders/${orderId}`, file);
}

export function listSupplyFiles(supplyInvoiceId: string) {
  return apiRequest<FileAttachment[]>(`/v1/files/supply-invoices/${supplyInvoiceId}`);
}

export function uploadSupplyFile(supplyInvoiceId: string, file: File) {
  return apiUpload<FileAttachment>(`/v1/files/supply-invoices/${supplyInvoiceId}`, file);
}

export function deleteAttachment(fileId: string) {
  return apiRequest<{ deleted: true }>(`/v1/files/${fileId}`, { method: 'DELETE' });
}

export async function downloadAttachment(file: FileAttachment) {
  const result = await apiDownload(`/v1/files/${file.id}/download`);
  const url = URL.createObjectURL(result.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = result.fileName || file.originalName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function previewAttachment(file: FileAttachment) {
  const previewWindow = window.open('', '_blank');
  if (!previewWindow) throw new Error('Браузер заблокировал новое окно. Разрешите всплывающие окна для CRM.');
  previewWindow.opener = null;
  previewWindow.document.title = file.originalName;
  previewWindow.document.body.textContent = 'Открываем документ…';

  try {
    const result = await apiDownload(`/v1/files/${file.id}/download`);
    const url = URL.createObjectURL(result.blob);
    previewWindow.location.replace(url);
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    previewWindow.close();
    throw error;
  }
}

function metadataFields(metadata: PatientArchiveMetadata) {
  return Object.fromEntries(
    Object.entries(metadata).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && Boolean(entry[1])),
  );
}
