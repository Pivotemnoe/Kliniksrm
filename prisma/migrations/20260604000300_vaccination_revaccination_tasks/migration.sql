ALTER TABLE "Vaccination" ADD COLUMN "vaccinatedAt" TIMESTAMP(3);
ALTER TABLE "Vaccination" ADD COLUMN "vaccineBatch" TEXT;
ALTER TABLE "Vaccination" ADD COLUMN "vaccineSeries" TEXT;
ALTER TABLE "Vaccination" ADD COLUMN "vaccineExpiresAt" TIMESTAMP(3);
ALTER TABLE "Vaccination" ADD COLUMN "smsReminder" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Task" ADD COLUMN "sourceVaccinationId" TEXT;

CREATE INDEX "Vaccination_vaccinatedAt_idx" ON "Vaccination"("vaccinatedAt");
CREATE UNIQUE INDEX "Task_sourceVaccinationId_key" ON "Task"("sourceVaccinationId");

ALTER TABLE "Task"
ADD CONSTRAINT "Task_sourceVaccinationId_fkey"
FOREIGN KEY ("sourceVaccinationId")
REFERENCES "Vaccination"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
