CREATE TYPE "MedicalPhraseSource" AS ENUM ('SYSTEM', 'EMPLOYEE', 'DIAGNOSIS_TEMPLATE');

CREATE TABLE "MedicalPhrase" (
    "id" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "category" TEXT,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "textHash" TEXT NOT NULL,
    "species" TEXT,
    "diagnosis" TEXT,
    "source" "MedicalPhraseSource" NOT NULL DEFAULT 'SYSTEM',
    "scopeKey" TEXT NOT NULL DEFAULT 'system',
    "employeeId" TEXT,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicalPhrase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MedicalPhrase_field_scopeKey_textHash_key" ON "MedicalPhrase"("field", "scopeKey", "textHash");
CREATE INDEX "MedicalPhrase_field_usageCount_idx" ON "MedicalPhrase"("field", "usageCount");
CREATE INDEX "MedicalPhrase_employeeId_field_idx" ON "MedicalPhrase"("employeeId", "field");
CREATE INDEX "MedicalPhrase_diagnosis_idx" ON "MedicalPhrase"("diagnosis");
CREATE INDEX "MedicalPhrase_species_idx" ON "MedicalPhrase"("species");

ALTER TABLE "MedicalPhrase" ADD CONSTRAINT "MedicalPhrase_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
