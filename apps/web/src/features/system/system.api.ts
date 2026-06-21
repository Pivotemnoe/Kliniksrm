import { apiRequest } from '../../api/client';

export type HealthResponse = {
  status: string;
  service: string;
  database: string;
  timestamp: string;
};

export type MetaResponse = {
  name: string;
  version: string;
  modules: string[];
};

export function getHealth() {
  return apiRequest<HealthResponse>('/health');
}

export function getMeta() {
  return apiRequest<MetaResponse>('/v1/meta');
}
