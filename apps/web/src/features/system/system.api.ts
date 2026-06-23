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
  revision?: string;
  buildDate?: string | null;
  imageSource?: string | null;
  modules: string[];
};

export function getHealth() {
  return apiRequest<HealthResponse>('/health');
}

export function getMeta() {
  return apiRequest<MetaResponse>('/v1/meta');
}
