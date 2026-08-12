import { DecimalValue } from '../visits/types';

export type BusinessCategoryType = 'INCOME' | 'EXPENSE';
export type BusinessEntryStatus = 'ACTIVE' | 'VOIDED';
export type BusinessEntrySource = 'MANUAL' | 'UNRECORDED_REVENUE' | 'DAILY_DIFFERENCE' | 'PAYROLL_PAYOUT' | 'OWNER_OPERATION';
export type BusinessDailyCloseStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED';

export type BusinessCategory = {
  id: string;
  code: string;
  title: string;
  type: BusinessCategoryType;
  groupCode: string;
  affectsProfit: boolean;
  administratorAllowed: boolean;
  isActive: boolean;
  sortOrder: number;
};

export type BusinessResources = {
  offices: Array<{ id: string; organizationId: string; name: string; timezone: string }>;
  cashboxes: Array<{ id: string; officeId: string | null; title: string; office?: { id: string; name: string } | null }>;
  paymentMethods: Array<{ id: string; title: string; type: string }>;
  categories: BusinessCategory[];
  payrollPeriods: Array<{ id: string; title: string; totalAmount: DecimalValue; startsAt: string; endsAt: string }>;
};

export type BusinessEntry = {
  id: string;
  type: BusinessCategoryType;
  status: BusinessEntryStatus;
  source: BusinessEntrySource;
  categoryId: string;
  officeId: string | null;
  cashboxId: string | null;
  paymentMethodId: string | null;
  payrollPeriodId: string | null;
  dailyCloseId: string | null;
  correctionOfId: string | null;
  amount: DecimalValue;
  occurredAt: string;
  counterparty: string | null;
  documentNumber: string | null;
  comment: string | null;
  requiresResolution: boolean;
  resolutionNote: string | null;
  voidReason: string | null;
  category: BusinessCategory;
  office?: { id: string; name: string } | null;
  cashbox?: { id: string; title: string } | null;
  paymentMethod?: { id: string; title: string; type: string } | null;
  payrollPeriod?: { id: string; title: string; totalAmount: DecimalValue; status: string } | null;
  correctionOf?: { id: string; amount: DecimalValue; comment: string | null; occurredAt: string } | null;
  createdBy?: { id: string; fullName: string } | null;
};

export type BusinessDailyCloseLine = {
  id: string;
  lineKey: string;
  titleSnapshot: string;
  paymentType: string;
  cashboxId: string | null;
  paymentMethodId: string | null;
  systemAmount: DecimalValue;
  inflowAmount?: DecimalValue;
  outflowAmount?: DecimalValue;
  actualAmount: DecimalValue;
  difference: DecimalValue;
  comment: string | null;
  cashbox?: { id: string; title: string } | null;
  paymentMethod?: { id: string; title: string; type: string } | null;
};

export type BusinessDailyClose = {
  id: string;
  officeId: string;
  businessDate: string;
  status: BusinessDailyCloseStatus;
  systemIncome: DecimalValue;
  systemRefunds: DecimalValue;
  systemExpense: DecimalValue;
  manualIncome: DecimalValue;
  manualExpense: DecimalValue;
  expectedAmount: DecimalValue;
  actualAmount: DecimalValue;
  difference: DecimalValue;
  comment: string | null;
  office: { id: string; name: string };
  lines: BusinessDailyCloseLine[];
  entries: BusinessEntry[];
  createdBy?: { id: string; fullName: string } | null;
  submittedBy?: { id: string; fullName: string } | null;
  approvedBy?: { id: string; fullName: string } | null;
  submittedAt: string | null;
  approvedAt: string | null;
};

export type BusinessMetricSet = {
  accruedSystemRevenue: number;
  accruedRevenue: number;
  cashIncome: number;
  refunds: number;
  manualIncome: number;
  unrecordedRevenue: number;
  otherManualIncome: number;
  unrecordedProfitRevenue: number;
  otherProfitIncome: number;
  manualExpense: number;
  supplierOutflow: number;
  costOfGoods: number;
  grossProfit: number;
  payrollExpense: number;
  dailySalaryExpense: number;
  operatingExpenses: number;
  operatingProfit: number;
  marginPercent: number;
  cashNet: number;
  billsCount: number;
  averageBill: number;
  visits: number;
  uniqueOwners: number;
  newOwners: number;
  note: string;
  daily: Array<{ date: string; accruedRevenue: number; systemRevenue: number; unrecordedRevenue: number; otherIncome: number; cashIncome: number; cashExpense: number; profitExpense: number; salaryExpense: number; costOfGoods: number; operatingProfitAfterManualExpenses: number; cashNet: number }>;
  categoryExpenses: Array<{ categoryId: string; title: string; groupCode: string; affectsProfit: boolean; amount: number }>;
  categoryIncome: Array<{ categoryId: string; title: string; groupCode: string; affectsProfit: boolean; amount: number }>;
};

export type BusinessSummary = {
  generatedAt: string;
  range: { from: string; to: string };
  officeId: string | null;
  current: BusinessMetricSet;
  previous: { accruedRevenue: number; operatingProfit: number; cashNet: number };
  balances: { debtorsAmount: number; supplierPayable: number };
  control: { unresolvedEntries: number; draftDays: number; submittedDays: number; approvedDays: number; totalDifference: number };
  closes: BusinessDailyClose[];
};

export type BusinessEntryInput = {
  type: BusinessCategoryType;
  categoryId: string;
  amount: number;
  occurredAt: string;
  source?: BusinessEntrySource;
  officeId?: string;
  cashboxId?: string;
  paymentMethodId?: string;
  payrollPeriodId?: string;
  dailyCloseId?: string;
  counterparty?: string;
  documentNumber?: string;
  comment?: string;
};

export type BusinessEntryCorrectionInput = {
  categoryId: string;
  amount: number;
  cashboxId?: string;
  paymentMethodId?: string;
  counterparty?: string;
  documentNumber?: string;
  comment?: string;
  reason: string;
};

export type BusinessCategoryInput = {
  code?: string;
  title: string;
  type: BusinessCategoryType;
  groupCode?: string;
  affectsProfit: boolean;
  administratorAllowed?: boolean;
  isActive?: boolean;
  sortOrder?: number;
};

export type DirectorBriefingSettings = {
  directorBriefingEnabled: boolean;
  directorBriefingTime: string;
  directorBriefingTimezone: string;
};

export type DirectorBriefingSnapshot = {
  reportDate: string;
  visits: { total: number; uniqueOwners: number; completed: number; unfinishedOverHour: number };
  appointments: { total: number; completed: number; cancelled: number; noShow: number };
  finance: { billed: number; paid: number; refunds: number; manualRevenue: number; otherIncome: number; expenses: number; debtorsAmount: number; supplierPayable: number };
  control: { unresolvedEntries: number; submittedCloses: number };
  vaccinations: { today: number; overdue: number; upcoming30Days: number };
  stock: { lowStock: number };
  laboratory: { ordered: number; completed: number; openNow: number };
  documents: { generated: number };
};

export type DirectorBriefing = {
  id: string;
  businessDate: string;
  rangeFrom: string;
  rangeTo: string;
  trigger: 'SCHEDULED' | 'MANUAL';
  title: string;
  summary: string;
  snapshot: DirectorBriefingSnapshot;
  createdAt: string;
  createdById: string | null;
};
