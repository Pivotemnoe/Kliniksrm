import { apiRequest } from '../../api/client';
import { ListQuery, PaginatedResponse } from '../../shared/types/api';
import { buildQuery } from '../../shared/utils/query';
import {
  Animal,
  AnimalCatalog,
  AnimalMutationInput,
  AnimalWeightRecord,
  Vaccination,
  VaccinationMutationInput,
  WeightMutationInput,
} from './types';

export type ListAnimalsQuery = ListQuery & {
  ownerId?: string;
};

export function listAnimals(query: ListAnimalsQuery) {
  return apiRequest<PaginatedResponse<Animal>>(`/v1/animals${buildQuery(query)}`);
}

export function getAnimalCatalog() {
  return apiRequest<AnimalCatalog>('/v1/animals/catalog');
}

export function getAnimal(animalId: string) {
  return apiRequest<Animal>(`/v1/animals/${animalId}`);
}

export function updateAnimal(animalId: string, input: AnimalMutationInput) {
  return apiRequest<Animal>(`/v1/animals/${animalId}`, {
    method: 'PATCH',
    body: input,
  });
}

export function listWeightRecords(animalId: string) {
  return apiRequest<AnimalWeightRecord[]>(`/v1/animals/${animalId}/weights`);
}

export function createWeightRecord(animalId: string, input: WeightMutationInput) {
  return apiRequest<AnimalWeightRecord>(`/v1/animals/${animalId}/weights`, {
    method: 'POST',
    body: input,
  });
}

export function listVaccinations(animalId: string) {
  return apiRequest<Vaccination[]>(`/v1/animals/${animalId}/vaccinations`);
}

export function createVaccination(animalId: string, input: VaccinationMutationInput) {
  return apiRequest<Vaccination>(`/v1/animals/${animalId}/vaccinations`, {
    method: 'POST',
    body: input,
  });
}

export function updateVaccination(animalId: string, vaccinationId: string, input: VaccinationMutationInput) {
  return apiRequest<Vaccination>(`/v1/animals/${animalId}/vaccinations/${vaccinationId}`, {
    method: 'PATCH',
    body: input,
  });
}
