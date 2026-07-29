-- Hospital stay now has its own lifecycle instead of borrowing Visit.status.
-- Existing hospital visits are copied first; no clinical rows are deleted.
CREATE TYPE "HospitalStayStatus" AS ENUM ('ACTIVE', 'DISCHARGED', 'CANCELLED');

CREATE TABLE "HospitalStay" (
    "id" TEXT NOT NULL,
    "sourceVisitId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "employeeId" TEXT,
    "hospitalBoxId" TEXT NOT NULL,
    "status" "HospitalStayStatus" NOT NULL DEFAULT 'ACTIVE',
    "purpose" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalStay_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HospitalStay_sourceVisitId_key" ON "HospitalStay"("sourceVisitId");
CREATE INDEX "HospitalStay_status_startedAt_idx" ON "HospitalStay"("status", "startedAt");
CREATE INDEX "HospitalStay_ownerId_idx" ON "HospitalStay"("ownerId");
CREATE INDEX "HospitalStay_animalId_idx" ON "HospitalStay"("animalId");
CREATE INDEX "HospitalStay_employeeId_idx" ON "HospitalStay"("employeeId");
CREATE INDEX "HospitalStay_hospitalBoxId_idx" ON "HospitalStay"("hospitalBoxId");

ALTER TABLE "HospitalStay"
ADD CONSTRAINT "HospitalStay_sourceVisitId_fkey"
FOREIGN KEY ("sourceVisitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HospitalStay"
ADD CONSTRAINT "HospitalStay_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HospitalStay"
ADD CONSTRAINT "HospitalStay_animalId_fkey"
FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HospitalStay"
ADD CONSTRAINT "HospitalStay_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "HospitalStay"
ADD CONSTRAINT "HospitalStay_hospitalBoxId_fkey"
FOREIGN KEY ("hospitalBoxId") REFERENCES "HospitalBox"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "HospitalStay" (
    "id", "sourceVisitId", "ownerId", "animalId", "employeeId", "hospitalBoxId",
    "status", "purpose", "startedAt", "completedAt", "createdAt", "updatedAt"
)
SELECT
    v."id",
    v."id",
    v."ownerId",
    v."animalId",
    v."employeeId",
    v."hospitalBoxId",
    CASE
      WHEN v."status" = 'CANCELLED' THEN 'CANCELLED'::"HospitalStayStatus"
      WHEN v."status" = 'COMPLETED' THEN 'DISCHARGED'::"HospitalStayStatus"
      ELSE 'ACTIVE'::"HospitalStayStatus"
    END,
    e."purpose",
    v."startedAt",
    CASE WHEN v."status" IN ('COMPLETED', 'CANCELLED') THEN v."completedAt" ELSE NULL END,
    v."createdAt",
    CURRENT_TIMESTAMP
FROM "Visit" v
LEFT JOIN "VisitExam" e ON e."visitId" = v."id"
WHERE v."hospitalBoxId" IS NOT NULL
ON CONFLICT ("sourceVisitId") DO NOTHING;

-- The intake visit is completed once the patient is handed over to the
-- independent hospital stay. Its medical text, bill and journal remain intact.
UPDATE "Visit"
SET "status" = 'COMPLETED',
    "completedAt" = COALESCE("completedAt", CURRENT_TIMESTAMP),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "hospitalBoxId" IS NOT NULL
  AND "status" IN ('DRAFT', 'IN_PROGRESS');

UPDATE "Appointment" a
SET "status" = 'COMPLETED',
    "updatedAt" = CURRENT_TIMESTAMP
FROM "Visit" v
WHERE v."appointmentId" = a."id"
  AND v."hospitalBoxId" IS NOT NULL
  AND a."status" IN ('ARRIVED', 'IN_PROGRESS');

UPDATE "QueueEntry" q
SET "status" = 'COMPLETED',
    "updatedAt" = CURRENT_TIMESTAMP
FROM "Visit" v
WHERE v."queueEntryId" = q."id"
  AND v."hospitalBoxId" IS NOT NULL
  AND q."status" = 'IN_PROGRESS';
