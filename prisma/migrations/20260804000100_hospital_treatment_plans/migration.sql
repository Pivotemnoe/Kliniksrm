-- Additive grouping for multi-item, multi-date inpatient treatment plans.
-- Existing hospital records remain unchanged and continue to work without a plan.
CREATE TABLE "HospitalTreatmentPlan" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "createdById" TEXT,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalTreatmentPlan_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "HospitalRecord"
    ADD COLUMN "treatmentPlanId" TEXT,
    ADD COLUMN "treatmentPlanItemId" TEXT;

CREATE INDEX "HospitalTreatmentPlan_visitId_createdAt_idx"
    ON "HospitalTreatmentPlan"("visitId", "createdAt");

CREATE INDEX "HospitalTreatmentPlan_createdById_idx"
    ON "HospitalTreatmentPlan"("createdById");

CREATE INDEX "HospitalRecord_treatmentPlanId_treatmentPlanItemId_recordedAt_idx"
    ON "HospitalRecord"("treatmentPlanId", "treatmentPlanItemId", "recordedAt");

ALTER TABLE "HospitalTreatmentPlan"
    ADD CONSTRAINT "HospitalTreatmentPlan_visitId_fkey"
    FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HospitalTreatmentPlan"
    ADD CONSTRAINT "HospitalTreatmentPlan_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "HospitalRecord"
    ADD CONSTRAINT "HospitalRecord_treatmentPlanId_fkey"
    FOREIGN KEY ("treatmentPlanId") REFERENCES "HospitalTreatmentPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
