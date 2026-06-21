import { Animal } from '../animals/types';
import { Owner } from '../owners/types';
import { DecimalValue, VisitExam, VisitRecommendation, VisitStatus } from '../visits/types';

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
  ownerId: string;
  animalId: string;
  employeeId: string | null;
  hospitalBoxId: string | null;
  status: VisitStatus;
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
};

export type AdmitHospitalInput = {
  ownerId: string;
  animalId: string;
  hospitalBoxId: string;
  employeeId?: string;
  admittedAt?: string;
  status?: VisitStatus;
  purpose?: string;
};
