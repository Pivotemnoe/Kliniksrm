import { apiRequest } from '../../api/client';
import { ListQuery, PaginatedResponse } from '../../shared/types/api';
import { buildQuery } from '../../shared/utils/query';
import { Animal, AnimalMutationInput } from '../animals/types';
import { Owner, OwnerBalanceOperationInput, OwnerMutationInput } from './types';

export function listOwners(query: ListQuery) {
  return apiRequest<PaginatedResponse<Owner>>(`/v1/owners${buildQuery(query)}`);
}

export function getOwner(ownerId: string) {
  return apiRequest<Owner>(`/v1/owners/${ownerId}`);
}

export function createOwner(input: OwnerMutationInput) {
  return apiRequest<Owner>('/v1/owners', {
    method: 'POST',
    body: input,
  });
}

export function updateOwner(ownerId: string, input: OwnerMutationInput) {
  return apiRequest<Owner>(`/v1/owners/${ownerId}`, {
    method: 'PATCH',
    body: input,
  });
}

export function mergeOwner(ownerId: string, sourceOwnerId: string) {
  return apiRequest<Owner>(`/v1/owners/${ownerId}/merge`, {
    method: 'POST',
    body: { sourceOwnerId },
  });
}

export function createOwnerBalanceOperation(ownerId: string, input: OwnerBalanceOperationInput) {
  return apiRequest<Owner>(`/v1/owners/${ownerId}/balance-operations`, {
    method: 'POST',
    body: input,
  });
}

export function listOwnerAnimals(ownerId: string) {
  return apiRequest<Animal[]>(`/v1/owners/${ownerId}/animals`);
}

export function createOwnerAnimal(ownerId: string, input: AnimalMutationInput) {
  return apiRequest<Animal>(`/v1/owners/${ownerId}/animals`, {
    method: 'POST',
    body: input,
  });
}
