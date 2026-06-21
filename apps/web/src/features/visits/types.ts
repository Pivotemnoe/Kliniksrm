import { Animal, AnimalWeightRecord, Vaccination } from '../animals/types';
import { Owner } from '../owners/types';
import { SchedulingEmployee } from '../scheduling/types';

export type DecimalValue = string | number;

export type VisitStatus = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type VisitSummary = {
  id: string;
  status: VisitStatus;
  startedAt: string;
  totalAmount: DecimalValue;
};

export type VisitListItem = {
  id: string;
  ownerId: string;
  animalId: string;
  employeeId: string | null;
  appointmentId: string | null;
  queueEntryId: string | null;
  hospitalBoxId: string | null;
  status: VisitStatus;
  startedAt: string;
  completedAt: string | null;
  totalAmount: DecimalValue;
  createdAt: string;
  updatedAt: string;
  owner?: Pick<Owner, 'id' | 'fullName' | 'phone' | 'extraPhone'> | null;
  animal?: Pick<Animal, 'id' | 'nickname' | 'species' | 'breed' | 'sex' | 'status'> | null;
  employee?: Pick<SchedulingEmployee, 'id' | 'fullName' | 'position'> | null;
  bill?: Pick<VisitBill, 'id' | 'status' | 'totalAmount' | 'paidAmount'> | null;
  _count?: {
    diagnoses: number;
    documents: number;
    files: number;
  };
};

export type Visit = Omit<VisitListItem, 'owner' | 'animal' | 'bill'> & {
  owner: Owner;
  animal: Animal & {
    weights?: AnimalWeightRecord[];
    vaccinations?: Vaccination[];
  };
  appointment: VisitAppointment | null;
  queueEntry: VisitQueueEntry | null;
  hospitalBox: VisitHospitalBox | null;
  exam: VisitExam | null;
  diagnoses: VisitDiagnosis[];
  recommendation: VisitRecommendation | null;
  laboratoryOrders: VisitLaboratoryOrder[];
  bill: VisitBill | null;
};

export type VisitAppointment = {
  id: string;
  startsAt: string;
  endsAt: string | null;
  status: string;
  comment: string | null;
};

export type VisitQueueEntry = {
  id: string;
  status: string;
  urgency: string;
  comment: string | null;
  createdAt: string;
};

export type VisitHospitalBox = {
  id: string;
  name?: string;
  title?: string;
};

export type VisitExam = {
  id: string;
  visitId: string;
  purpose: string | null;
  anamnesis: string | null;
  examination: string | null;
  symptoms: string | null;
  manipulations: string | null;
  weightKg: DecimalValue | null;
  temperatureC: DecimalValue | null;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VisitDiagnosis = {
  id: string;
  visitId: string;
  diagnosisType: string | null;
  title: string;
  description: string | null;
  status: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VisitRecommendation = {
  id: string;
  visitId: string;
  treatmentPlan: string | null;
  careNotes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VisitLaboratoryOrderStatus = 'ORDERED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type VisitLaboratoryOrderItemStatus = 'ORDERED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type VisitLaboratoryOrder = {
  id: string;
  visitId: string;
  status: VisitLaboratoryOrderStatus;
  comment: string | null;
  createdById: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: VisitLaboratoryOrderItem[];
};

export type VisitLaboratoryOrderItem = {
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

export type VisitBill = {
  id: string;
  status: BillPaymentStatus;
  totalAmount: DecimalValue;
  paidAmount: DecimalValue;
  items?: VisitBillItem[];
  payments?: VisitPayment[];
};

export type VisitBillItem = {
  id: string;
  billId: string;
  productId: string | null;
  serviceId: string | null;
  title: string;
  quantity: DecimalValue;
  unitPrice: DecimalValue;
  discount: DecimalValue;
  totalAmount: DecimalValue;
  createdAt: string;
  service?: {
    id: string;
    title: string;
    price: DecimalValue;
  } | null;
  product?: {
    id: string;
    title: string;
    retailPrice: DecimalValue;
  } | null;
  stockMovements?: Array<{
    id: string;
    type: string;
    quantity: DecimalValue;
    createdAt: string;
    stockBatch?: { id: string; series: string | null; expiresAt: string | null } | null;
    warehouse?: { id: string; name: string } | null;
  }>;
};

export type VisitPayment = {
  id: string;
  billId: string;
  type: string;
  amount: DecimalValue;
  paidAt: string;
  comment: string | null;
  createdAt: string;
};

export type BillPaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'REFUNDED' | 'CANCELLED';

export type ListVisitsQuery = {
  search?: string;
  status?: VisitStatus;
  ownerId?: string;
  animalId?: string;
  employeeId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
};

export type CreateVisitInput = {
  ownerId?: string;
  animalId?: string;
  employeeId?: string;
  appointmentId?: string;
  queueEntryId?: string;
  hospitalBoxId?: string;
  startedAt?: string;
  status?: VisitStatus;
};

export type UpdateVisitInput = {
  employeeId?: string;
  hospitalBoxId?: string;
  status?: VisitStatus;
};

export type VisitExamInput = {
  purpose?: string;
  anamnesis?: string;
  examination?: string;
  symptoms?: string;
  manipulations?: string;
  weightKg?: number;
  temperatureC?: number;
  comment?: string;
};

export type VisitRecommendationInput = {
  treatmentPlan?: string;
  careNotes?: string;
};

export type VisitDiagnosisInput = {
  title: string;
  diagnosisType?: string;
  description?: string;
  status?: string;
};

export type VisitServiceLineInput = {
  serviceId?: string;
  productId?: string;
  title?: string;
  quantity?: number;
  unitPrice?: number;
  discount?: number;
};

export type VisitLaboratoryOrderInput = {
  testIds?: string[];
  profileIds?: string[];
  comment?: string;
};

export type VisitLaboratoryItemInput = {
  status?: VisitLaboratoryOrderItemStatus;
  resultValue?: string;
  resultText?: string;
  unit?: string;
  referenceRange?: string;
  comment?: string;
};

export const visitStatusLabels: Record<VisitStatus, string> = {
  DRAFT: 'Черновик',
  IN_PROGRESS: 'В работе',
  COMPLETED: 'Завершён',
  CANCELLED: 'Отменён',
};

export const visitStatusColors: Record<VisitStatus, string> = {
  DRAFT: 'default',
  IN_PROGRESS: 'gold',
  COMPLETED: 'green',
  CANCELLED: 'red',
};

export const laboratoryOrderStatusLabels: Record<VisitLaboratoryOrderStatus, string> = {
  ORDERED: 'Назначен',
  IN_PROGRESS: 'В работе',
  COMPLETED: 'Готов',
  CANCELLED: 'Отменён',
};

export const laboratoryOrderStatusColors: Record<VisitLaboratoryOrderStatus, string> = {
  ORDERED: 'blue',
  IN_PROGRESS: 'gold',
  COMPLETED: 'green',
  CANCELLED: 'default',
};

export const laboratoryOrderItemStatusLabels: Record<VisitLaboratoryOrderItemStatus, string> = {
  ORDERED: 'Назначен',
  IN_PROGRESS: 'В работе',
  COMPLETED: 'Готов',
  CANCELLED: 'Отменён',
};
