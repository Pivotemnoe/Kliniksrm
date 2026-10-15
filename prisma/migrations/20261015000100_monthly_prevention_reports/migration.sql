ALTER TABLE "Organization" ADD COLUMN "preventionReportSettings" JSONB;
ALTER TABLE "Vaccination" ADD COLUMN "reportDetails" JSONB;

CREATE TABLE "MonthlyPreventionReport" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "month" VARCHAR(7) NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL,
  "trigger" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "document" BYTEA NOT NULL,
  "sha256" VARCHAR(64) NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MonthlyPreventionReport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MonthlyPreventionReport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MonthlyPreventionReport_organizationId_month_revision_key" ON "MonthlyPreventionReport"("organizationId", "month", "revision");
CREATE INDEX "MonthlyPreventionReport_organizationId_month_idx" ON "MonthlyPreventionReport"("organizationId", "month");
