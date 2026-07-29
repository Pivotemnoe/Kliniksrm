import { Animal } from '../animals/types';
import { Owner } from '../owners/types';
import { DecimalValue, VisitExam, VisitRecommendation } from '../visits/types';

export type HospitalStayStatus = 'ACTIVE' | 'DISCHARGED' | 'CANCELLED';

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
  title: string;
  recordedAt: string;
  temperatureC: DecimalValue | null;
  value: string | null;
  notes: string | null;
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
  title: string;
  recordedAt?: string;
  temperatureC?: number;
  value?: string;
  notes?: string;
};
