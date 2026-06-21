import { apiRequest } from '../../api/client';
import { buildQuery } from '../../shared/utils/query';
import { ListMedicalPhrasesQuery, ManageMedicalPhrasesQuery, MedicalPhrase, UpsertMedicalPhrasePayload } from './types';

export function listMedicalPhrases(query: ListMedicalPhrasesQuery) {
  return apiRequest<{ items: MedicalPhrase[] }>(`/v1/medical-phrases${buildQuery(query)}`);
}

export function recordMedicalPhraseUsage(phraseId: string) {
  return apiRequest<MedicalPhrase>('/v1/medical-phrases/usage', {
    method: 'POST',
    body: { phraseId },
  });
}

export function manageMedicalPhrases(query: ManageMedicalPhrasesQuery) {
  return apiRequest<{ items: MedicalPhrase[]; total: number; limit: number; offset: number }>(`/v1/medical-phrases/manage${buildQuery(query)}`);
}

export function createMedicalPhrase(payload: UpsertMedicalPhrasePayload) {
  return apiRequest<MedicalPhrase>('/v1/medical-phrases', {
    method: 'POST',
    body: payload,
  });
}

export function updateMedicalPhrase(phraseId: string, payload: UpsertMedicalPhrasePayload) {
  return apiRequest<MedicalPhrase>(`/v1/medical-phrases/${phraseId}`, {
    method: 'PATCH',
    body: payload,
  });
}

export function removeMedicalPhrase(phraseId: string) {
  return apiRequest<MedicalPhrase | { ok: true; mode: string }>(`/v1/medical-phrases/${phraseId}`, {
    method: 'DELETE',
  });
}

export function cleanupLearnedMedicalPhrases(payload: { field?: string; employeeId?: string }) {
  return apiRequest<{ ok: true; deletedCount: number }>('/v1/medical-phrases/cleanup', {
    method: 'POST',
    body: payload,
  });
}
