import type { DecimalValue, VisitLaboratoryOrderItemStatus, VisitLaboratoryOrderStatus, VisitStatus } from '../visits/types';

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

export type LaboratoryOrdersQuery = {
  search?: string;
  status?: VisitLaboratoryOrderStatus;
  activeOnly?: boolean;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

export type LaboratoryOrder = {
  id: string;
  visitId: string;
  status: VisitLaboratoryOrderStatus;
  comment: string | null;
  createdById: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  visit: {
    id: string;
    status: VisitStatus;
    startedAt: string;
    completedAt: string | null;
    owner: { id: string; fullName: string; phone: string | null };
    animal: { id: string; nickname: string; species: string | null; breed: string | null };
    employee: { id: string; fullName: string; position: string | null } | null;
  };
  items: LaboratoryOrderItem[];
};

export type LaboratoryOrderItem = {
  id: string;
  orderId: string;
  testId: string | null;
  profileId: string | null;
  billItemId: string | null;
  status: VisitLaboratoryOrderItemStatus;
  title: string;
  code: string | null;
  groupName: string | null;
  material: string | null;
  method: string | null;
  unit: string | null;
  referenceRange: string | null;
  resultValue: string | null;
  resultText: string | null;
  comment: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  test?: { id: string; title: string; code: string | null; groupName: string | null } | null;
  profile?: { id: string; title: string; code: string | null } | null;
  billItem?: { id: string; title: string; totalAmount: DecimalValue } | null;
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

export type LaboratoryOrderItemInput = {
  status?: VisitLaboratoryOrderItemStatus;
  resultValue?: string | null;
  resultText?: string | null;
  unit?: string | null;
  referenceRange?: string | null;
  comment?: string | null;
};

export type LaboratoryOrderInput = {
  status?: VisitLaboratoryOrderStatus;
  comment?: string | null;
};
