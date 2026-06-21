import { DecimalValue } from '../visits/types';

export type LaboratoryServiceItem = {
  id: string;
  title: string;
  price: DecimalValue;
  category?: { id: string; title: string } | null;
};

export type LaboratoryResources = {
  services: LaboratoryServiceItem[];
  species: Array<{ id: string; title: string }>;
};

export type LaboratoryTest = {
  id: string;
  serviceId: string | null;
  service?: LaboratoryServiceItem | null;
  code: string | null;
  title: string;
  groupName: string | null;
  material: string | null;
  method: string | null;
  unit: string | null;
  referenceRange: string | null;
  species: string[];
  description: string | null;
  isActive: boolean;
  _count?: { profileLinks: number };
};

export type LaboratoryProfileTest = {
  profileId: string;
  testId: string;
  sortOrder: number;
  test: Pick<LaboratoryTest, 'id' | 'title' | 'code' | 'groupName' | 'unit' | 'referenceRange' | 'species' | 'isActive'>;
};

export type LaboratoryProfile = {
  id: string;
  serviceId: string | null;
  service?: LaboratoryServiceItem | null;
  code: string | null;
  title: string;
  description: string | null;
  species: string[];
  isActive: boolean;
  tests: LaboratoryProfileTest[];
};

export type LaboratoryListQuery = {
  search?: string;
  species?: string;
  serviceId?: string;
  isActive?: boolean;
  limit?: number;
  offset?: number;
};

export type LaboratoryTestInput = {
  title: string;
  code?: string | null;
  groupName?: string | null;
  material?: string | null;
  method?: string | null;
  unit?: string | null;
  referenceRange?: string | null;
  species?: string[];
  serviceId?: string | null;
  isActive?: boolean;
  description?: string | null;
};

export type LaboratoryProfileInput = {
  title: string;
  code?: string | null;
  description?: string | null;
  species?: string[];
  serviceId?: string | null;
  isActive?: boolean;
  testIds?: string[];
};
