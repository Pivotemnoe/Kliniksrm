import { apiDownload, apiRequest, apiUpload } from '../../api/client';
import { FileAttachment } from './types';

export function listVisitFiles(visitId: string) {
  return apiRequest<FileAttachment[]>(`/v1/files/visits/${visitId}`);
}

export function uploadVisitFile(visitId: string, file: File) {
  return apiUpload<FileAttachment>(`/v1/files/visits/${visitId}`, file);
}

export function listAnimalFiles(animalId: string) {
  return apiRequest<FileAttachment[]>(`/v1/files/animals/${animalId}`);
}

export function uploadAnimalFile(animalId: string, file: File) {
  return apiUpload<FileAttachment>(`/v1/files/animals/${animalId}`, file);
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
