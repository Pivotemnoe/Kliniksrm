import { Animal } from '../animals/types';
import { Owner } from '../owners/types';
import { DecimalValue, VisitExam, VisitRecommendation } from '../visits/types';

export type HospitalStayStatus = 'ACTIVE' | 'DISCHARGED' | 'CANCELLED';
export type HospitalRecordStatus = 'PLANNED' | 'COMPLETED' | 'SKIPPED' | 'AMENDMENT';

export type HospitalBox = {
  id: string;
  officeId: string;
  name: string;
  office?: {
    id: string;
    name: string;
  };
};

export type HospitalResources = {
  boxes: HospitalBox[];
};

export type HospitalCatalog = {
  products: Array<{
    id: string;
    title: string;
    retailPrice: DecimalValue;
    stockUnit: string | null;
    writeOffUnit: string | null;
    billingUnit: string | null;
    packageQuantity: DecimalValue | null;
    stockRest: DecimalValue;
  }>;
  services: Array<{
    id: string;
    title: string;
    price: DecimalValue;
    priceType: string;
  }>;
};

export type HospitalStay = {
  id: string;
  sourceVisitId: string;
  ownerId: string;
  animalId: string;
  employeeId: string | null;
  hospitalBoxId: string | null;
  status: HospitalStayStatus;
  purpose: string | null;
  startedAt: string;
  completedAt: string | null;
  timezone: string;
  totalAmount: DecimalValue;
  owner?: Pick<Owner, 'id' | 'fullName' | 'phone' | 'extraPhone'>;
  animal?: Pick<Animal, 'id' | 'nickname' | 'species' | 'breed' | 'sex' | 'status'>;
  employee?: {
    id: string;
    fullName: string;
    position: string | null;
  } | null;
  hospitalBox?: HospitalBox | null;
  exam?: VisitExam | null;
  recommendation?: VisitRecommendation | null;
  bill?: {
    id: string;
    status: string;
    totalAmount: DecimalValue;
    paidAmount: DecimalValue;
  } | null;
  hospitalRecords?: HospitalRecord[];
};

export type HospitalRecordType =
  | 'TEMPERATURE'
  | 'MEDICATION'
  | 'PROCEDURE'
  | 'OBSERVATION'
  | 'FEEDING'
  | 'CARE'
  | 'OTHER';

export type HospitalRecord = {
  id: string;
  visitId: string;
  recordedById: string | null;
  recordType: HospitalRecordType;
  recordStatus: HospitalRecordStatus;
  createdAsPlan: boolean;
  title: string;
  recordedAt: string;
  completedAt: string | null;
  temperatureC: DecimalValue | null;
  value: string | null;
  notes: string | null;
  parentRecordId: string | null;
  amendmentReason: string | null;
  amendments?: HospitalRecord[];
  canEditDirectly?: boolean;
  editRule?: 'DIRECT' | 'AMENDMENT_REQUIRED';
  billItemId: string | null;
  billItem?: {
    id: string;
    productId: string | null;
    serviceId: string | null;
    title: string;
    quantity: DecimalValue;
    stockQuantity: DecimalValue | null;
    unitPrice: DecimalValue;
    discount: DecimalValue;
    totalAmount: DecimalValue;
    product?: {
      id: string;
      title: string;
      stockUnit: string | null;
      writeOffUnit: string | null;
      billingUnit: string | null;
      packageQuantity: DecimalValue | null;
    } | null;
    service?: {
      id: string;
      title: string;
      priceType: string;
    } | null;
  } | null;
  recordedBy?: {
    id: string;
    fullName: string;
    position: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type AdmitHospitalInput = {
  ownerId: string;
  animalId: string;
  hospitalBoxId: string;
  employeeId?: string;
  admittedAt?: string;
  purpose?: string;
};

export type CreateHospitalRecordInput = {
  recordType: HospitalRecordType;
  recordStatus?: Extract<HospitalRecordStatus, 'PLANNED' | 'COMPLETED'>;
  title: string;
  recordedAt?: string;
  completedAt?: string;
  temperatureC?: number;
  value?: string;
  notes?: string;
  serviceId?: string;
  productId?: string;
  quantity?: number;
  stockQuantity?: number;
  unitPrice?: number;
};

export type UpdateHospitalRecordInput = Omit<Partial<CreateHospitalRecordInput>, 'serviceId' | 'productId' | 'recordStatus'> & {
  recordStatus?: Extract<HospitalRecordStatus, 'PLANNED' | 'COMPLETED' | 'SKIPPED'>;
};

export type CreateHospitalAmendmentInput = {
  reason: string;
  recordType: HospitalRecordType;
  title: string;
  temperatureC?: number;
  value?: string;
  notes?: string;
};
