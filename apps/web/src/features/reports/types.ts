export type ReportSalesRow = {
  key: string;
  kind: 'product' | 'service' | 'other';
  title: string;
  quantity: number;
  revenue: number;
  discount: number;
  lines: number;
};

export type ReportVaccinationItem = {
  id: string;
  title: string;
  expiresAt: string | null;
  ownerReminderEnabled: boolean;
  animal: {
    id: string;
    nickname: string;
    owner: { id: string; fullName: string; phone: string | null };
  };
};

export type ClinicReport = {
  generatedAt: string;
  range: { from: string; to: string };
  filters: { employeeId: string | null };
  employeeOptions: Array<{ id: string; fullName: string; position: string | null }>;
  finance: {
    billedAmount: number;
    receivedAmount: number;
    refundedAmount: number;
    paidAmount: number;
    debtAmount: number;
    depositsAmount: number;
    averageBill: number;
    billsCount: number;
    paymentsCount: number;
    debtorsCount: number;
    supplyPurchasesAmount: number;
    paymentMethods: Array<{ key: string; title: string; received: number; refunded: number; net: number; count: number }>;
    debtors: Array<{
      billId: string;
      ownerId: string | null;
      ownerName: string;
      phone: string | null;
      createdAt: string;
      dueAt: string | null;
      debt: number;
    }>;
  };
  traffic: {
    visitsTotal: number;
    visitsCompleted: number;
    visitsCancelled: number;
    appointmentsTotal: number;
    appointmentsCompleted: number;
    appointmentsCancelled: number;
    appointmentsNoShow: number;
    uniqueOwners: number;
    newOwners: number;
    daily: Array<{ date: string; billedAmount: number; paidAmount: number; visits: number }>;
  };
  sales: {
    services: ReportSalesRow[];
    products: ReportSalesRow[];
    other: ReportSalesRow[];
  };
  employees: Array<{
    employeeId: string;
    fullName: string;
    position: string | null;
    visits: number;
    completedVisits: number;
    billedAmount: number;
  }>;
  vaccinations: {
    administered: number;
    administeredByTitle: Array<{ title: string; count: number }>;
    upcoming: number;
    overdue: number;
    upcomingItems: ReportVaccinationItem[];
    overdueItems: ReportVaccinationItem[];
  };
  stock: {
    purchaseValue: number;
    retailValue: number;
    potentialMarkup: number;
    batches: number;
    products: number;
    lowStock: number;
    expiredBatches: number;
    expiringBatches: number;
    lowStockItems: Array<{ id: string; title: string; rest: number; minStock: number | null; unit: string | null }>;
    expiryItems: Array<{
      id: string;
      productTitle: string;
      warehouseName: string;
      series: string | null;
      expiresAt: string;
      rest: number;
      unit: string | null;
      purchasePrice: number;
      status: 'EXPIRED' | 'EXPIRING';
    }>;
  };
  profit: {
    revenue: number;
    costOfGoods: number;
    grossProfit: number;
    marginPercent: number;
    note: string;
  };
};
