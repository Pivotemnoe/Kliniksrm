-- Stage 3.5: additive management accounting and daily reconciliation.
-- Existing clinical, billing, payroll and stock records are not rewritten or deleted.

CREATE TYPE "BusinessCategoryType" AS ENUM ('INCOME', 'EXPENSE');
CREATE TYPE "BusinessEntrySource" AS ENUM ('MANUAL', 'UNRECORDED_REVENUE', 'DAILY_DIFFERENCE', 'PAYROLL_PAYOUT', 'OWNER_OPERATION');
CREATE TYPE "BusinessEntryStatus" AS ENUM ('ACTIVE', 'VOIDED');
CREATE TYPE "BusinessDailyCloseStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED');

ALTER TABLE "SupplierPayment"
  ADD COLUMN "cashboxId" TEXT,
  ADD COLUMN "paymentMethodId" TEXT;

CREATE TABLE "BusinessCategory" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "type" "BusinessCategoryType" NOT NULL,
  "groupCode" TEXT NOT NULL,
  "affectsProfit" BOOLEAN NOT NULL DEFAULT true,
  "administratorAllowed" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BusinessCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BusinessEntry" (
  "id" TEXT NOT NULL,
  "type" "BusinessCategoryType" NOT NULL,
  "status" "BusinessEntryStatus" NOT NULL DEFAULT 'ACTIVE',
  "source" "BusinessEntrySource" NOT NULL DEFAULT 'MANUAL',
  "categoryId" TEXT NOT NULL,
  "officeId" TEXT,
  "cashboxId" TEXT,
  "paymentMethodId" TEXT,
  "payrollPeriodId" TEXT,
  "dailyCloseId" TEXT,
  "amount" DECIMAL(12,2) NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "counterparty" TEXT,
  "documentNumber" TEXT,
  "comment" TEXT,
  "requiresResolution" BOOLEAN NOT NULL DEFAULT false,
  "resolvedAt" TIMESTAMP(3),
  "resolvedById" TEXT,
  "resolutionNote" TEXT,
  "createdById" TEXT,
  "voidedAt" TIMESTAMP(3),
  "voidedById" TEXT,
  "voidReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BusinessEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BusinessDailyClose" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "officeId" TEXT NOT NULL,
  "businessDate" DATE NOT NULL,
  "status" "BusinessDailyCloseStatus" NOT NULL DEFAULT 'DRAFT',
  "systemIncome" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "systemRefunds" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "systemExpense" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "manualIncome" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "manualExpense" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "expectedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "actualAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "difference" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "comment" TEXT,
  "createdById" TEXT,
  "submittedById" TEXT,
  "submittedAt" TIMESTAMP(3),
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BusinessDailyClose_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BusinessDailyCloseLine" (
  "id" TEXT NOT NULL,
  "dailyCloseId" TEXT NOT NULL,
  "lineKey" TEXT NOT NULL,
  "titleSnapshot" TEXT NOT NULL,
  "paymentType" "PaymentType" NOT NULL,
  "cashboxId" TEXT,
  "paymentMethodId" TEXT,
  "systemAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "actualAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "difference" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BusinessDailyCloseLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BusinessCategory_code_key" ON "BusinessCategory"("code");
CREATE INDEX "BusinessCategory_type_isActive_sortOrder_idx" ON "BusinessCategory"("type", "isActive", "sortOrder");
CREATE INDEX "BusinessEntry_occurredAt_status_idx" ON "BusinessEntry"("occurredAt", "status");
CREATE INDEX "BusinessEntry_categoryId_occurredAt_idx" ON "BusinessEntry"("categoryId", "occurredAt");
CREATE INDEX "BusinessEntry_officeId_occurredAt_idx" ON "BusinessEntry"("officeId", "occurredAt");
CREATE INDEX "BusinessEntry_cashboxId_occurredAt_idx" ON "BusinessEntry"("cashboxId", "occurredAt");
CREATE INDEX "BusinessEntry_payrollPeriodId_idx" ON "BusinessEntry"("payrollPeriodId");
CREATE INDEX "BusinessEntry_dailyCloseId_idx" ON "BusinessEntry"("dailyCloseId");
CREATE INDEX "BusinessEntry_requiresResolution_status_idx" ON "BusinessEntry"("requiresResolution", "status");
CREATE UNIQUE INDEX "BusinessDailyClose_officeId_businessDate_key" ON "BusinessDailyClose"("officeId", "businessDate");
CREATE INDEX "BusinessDailyClose_organizationId_businessDate_idx" ON "BusinessDailyClose"("organizationId", "businessDate");
CREATE INDEX "BusinessDailyClose_status_businessDate_idx" ON "BusinessDailyClose"("status", "businessDate");
CREATE UNIQUE INDEX "BusinessDailyCloseLine_dailyCloseId_lineKey_key" ON "BusinessDailyCloseLine"("dailyCloseId", "lineKey");
CREATE INDEX "BusinessDailyCloseLine_cashboxId_idx" ON "BusinessDailyCloseLine"("cashboxId");
CREATE INDEX "BusinessDailyCloseLine_paymentMethodId_idx" ON "BusinessDailyCloseLine"("paymentMethodId");
CREATE INDEX "SupplierPayment_cashboxId_idx" ON "SupplierPayment"("cashboxId");
CREATE INDEX "SupplierPayment_paymentMethodId_idx" ON "SupplierPayment"("paymentMethodId");

ALTER TABLE "BusinessEntry" ADD CONSTRAINT "BusinessEntry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "BusinessCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BusinessEntry" ADD CONSTRAINT "BusinessEntry_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "ClinicOffice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BusinessEntry" ADD CONSTRAINT "BusinessEntry_cashboxId_fkey" FOREIGN KEY ("cashboxId") REFERENCES "Cashbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BusinessEntry" ADD CONSTRAINT "BusinessEntry_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BusinessEntry" ADD CONSTRAINT "BusinessEntry_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BusinessEntry" ADD CONSTRAINT "BusinessEntry_dailyCloseId_fkey" FOREIGN KEY ("dailyCloseId") REFERENCES "BusinessDailyClose"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BusinessEntry" ADD CONSTRAINT "BusinessEntry_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BusinessEntry" ADD CONSTRAINT "BusinessEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BusinessEntry" ADD CONSTRAINT "BusinessEntry_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BusinessDailyClose" ADD CONSTRAINT "BusinessDailyClose_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BusinessDailyClose" ADD CONSTRAINT "BusinessDailyClose_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "ClinicOffice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BusinessDailyClose" ADD CONSTRAINT "BusinessDailyClose_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BusinessDailyClose" ADD CONSTRAINT "BusinessDailyClose_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BusinessDailyClose" ADD CONSTRAINT "BusinessDailyClose_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BusinessDailyCloseLine" ADD CONSTRAINT "BusinessDailyCloseLine_dailyCloseId_fkey" FOREIGN KEY ("dailyCloseId") REFERENCES "BusinessDailyClose"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusinessDailyCloseLine" ADD CONSTRAINT "BusinessDailyCloseLine_cashboxId_fkey" FOREIGN KEY ("cashboxId") REFERENCES "Cashbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BusinessDailyCloseLine" ADD CONSTRAINT "BusinessDailyCloseLine_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_cashboxId_fkey" FOREIGN KEY ("cashboxId") REFERENCES "Cashbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "code", "title", "createdAt", "updatedAt") VALUES
  ('44444444-4444-4444-8444-000000000001', 'daily_finance.read', 'Просмотр закрытия дня', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('44444444-4444-4444-8444-000000000002', 'daily_finance.manage', 'Внесение ежедневной выручки и расходов', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('44444444-4444-4444-8444-000000000003', 'daily_finance.submit', 'Отправка закрытия дня директору', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('44444444-4444-4444-8444-000000000004', 'business.read', 'Просмотр управленческой отчётности', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('44444444-4444-4444-8444-000000000005', 'business.manage', 'Управление доходами и расходами', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('44444444-4444-4444-8444-000000000006', 'business.approve', 'Утверждение закрытия дня', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET "title" = EXCLUDED."title", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission ON permission."code" IN ('daily_finance.read', 'daily_finance.manage', 'daily_finance.submit', 'business.read', 'business.manage', 'business.approve')
WHERE role."code" = 'director'
ON CONFLICT DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission ON permission."code" IN ('daily_finance.read', 'daily_finance.manage', 'daily_finance.submit')
WHERE role."code" = 'administrator'
ON CONFLICT DO NOTHING;

INSERT INTO "BusinessCategory" ("id", "code", "title", "type", "groupCode", "affectsProfit", "administratorAllowed", "isActive", "sortOrder", "createdAt", "updatedAt") VALUES
  ('55555555-5555-4555-8555-000000000001', 'unrecorded_revenue', 'Выручка, не проведённая через CRM', 'INCOME', 'REVENUE', true, true, true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('55555555-5555-4555-8555-000000000002', 'other_income', 'Прочий доход', 'INCOME', 'REVENUE', true, true, true, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('55555555-5555-4555-8555-000000000003', 'owner_contribution', 'Вклад собственника', 'INCOME', 'OWNER', false, false, true, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('55555555-5555-4555-8555-000000000004', 'loan_received', 'Полученный заём', 'INCOME', 'FINANCE', false, false, true, 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('55555555-5555-4555-8555-000000000101', 'petty_expense', 'Мелкие расходы дня', 'EXPENSE', 'OPERATING', true, true, true, 110, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('55555555-5555-4555-8555-000000000102', 'rent', 'Аренда', 'EXPENSE', 'OPERATING', true, false, true, 120, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('55555555-5555-4555-8555-000000000103', 'utilities', 'Коммунальные услуги', 'EXPENSE', 'OPERATING', true, false, true, 130, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('55555555-5555-4555-8555-000000000104', 'payroll', 'Выплата зарплаты', 'EXPENSE', 'PAYROLL', false, false, true, 140, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('55555555-5555-4555-8555-000000000105', 'taxes', 'Налоги и обязательные платежи', 'EXPENSE', 'TAX', true, false, true, 150, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('55555555-5555-4555-8555-000000000106', 'marketing', 'Реклама и маркетинг', 'EXPENSE', 'OPERATING', true, false, true, 160, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('55555555-5555-4555-8555-000000000107', 'repairs', 'Ремонт и обслуживание', 'EXPENSE', 'OPERATING', true, false, true, 170, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('55555555-5555-4555-8555-000000000108', 'training', 'Обучение сотрудников', 'EXPENSE', 'OPERATING', true, false, true, 180, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('55555555-5555-4555-8555-000000000109', 'bank_fees', 'Банковские комиссии', 'EXPENSE', 'FINANCE', true, false, true, 190, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('55555555-5555-4555-8555-000000000110', 'other_expense', 'Прочий расход', 'EXPENSE', 'OPERATING', true, false, true, 200, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('55555555-5555-4555-8555-000000000111', 'owner_withdrawal', 'Изъятие собственником', 'EXPENSE', 'OWNER', false, false, true, 210, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('55555555-5555-4555-8555-000000000112', 'asset_purchase', 'Покупка оборудования', 'EXPENSE', 'INVESTMENT', false, false, true, 220, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('55555555-5555-4555-8555-000000000113', 'loan_repayment', 'Погашение займа', 'EXPENSE', 'FINANCE', false, false, true, 230, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "title" = EXCLUDED."title",
  "type" = EXCLUDED."type",
  "groupCode" = EXCLUDED."groupCode",
  "affectsProfit" = EXCLUDED."affectsProfit",
  "administratorAllowed" = EXCLUDED."administratorAllowed",
  "sortOrder" = EXCLUDED."sortOrder",
  "updatedAt" = CURRENT_TIMESTAMP;
