-- Add an append-only clinical journal for hospital stays.
-- Existing visits and hospital assignments are not changed.
CREATE TABLE "HospitalRecord" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "recordedById" TEXT,
    "recordType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "temperatureC" DECIMAL(4,1),
    "value" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HospitalRecord_visitId_recordedAt_idx" ON "HospitalRecord"("visitId", "recordedAt");
CREATE INDEX "HospitalRecord_recordedById_idx" ON "HospitalRecord"("recordedById");

ALTER TABLE "HospitalRecord"
ADD CONSTRAINT "HospitalRecord_visitId_fkey"
FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HospitalRecord"
ADD CONSTRAINT "HospitalRecord_recordedById_fkey"
FOREIGN KEY ("recordedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
