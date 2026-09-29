-- AlterEnum
ALTER TYPE "BillSource" ADD VALUE 'HOSPITAL';

-- AlterTable
ALTER TABLE "HospitalStay" ADD COLUMN     "depositAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "diagnosis" TEXT,
ADD COLUMN     "dischargeReason" TEXT,
ADD COLUMN     "internalNotes" TEXT;

-- AlterTable
ALTER TABLE "HospitalStayRatePeriod" ADD COLUMN     "serviceId" TEXT,
ADD COLUMN     "serviceTitle" TEXT;

-- AlterTable
ALTER TABLE "Bill" ADD COLUMN     "hospitalStayId" TEXT;

-- CreateTable
CREATE TABLE "_HospitalBoxDailyServices" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_HospitalBoxDailyServices_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_HospitalBoxDailyServices_B_index" ON "_HospitalBoxDailyServices"("B");

-- CreateIndex
CREATE UNIQUE INDEX "Bill_hospitalStayId_key" ON "Bill"("hospitalStayId");

-- AddForeignKey
ALTER TABLE "HospitalStayRatePeriod" ADD CONSTRAINT "HospitalStayRatePeriod_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_hospitalStayId_fkey" FOREIGN KEY ("hospitalStayId") REFERENCES "HospitalStay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_HospitalBoxDailyServices" ADD CONSTRAINT "_HospitalBoxDailyServices_A_fkey" FOREIGN KEY ("A") REFERENCES "HospitalBox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_HospitalBoxDailyServices" ADD CONSTRAINT "_HospitalBoxDailyServices_B_fkey" FOREIGN KEY ("B") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Copy the initial diagnosis once. Later hospital edits never overwrite the visit.
UPDATE "HospitalStay" h SET "diagnosis" = d.titles
FROM (SELECT "visitId", string_agg("title", '; ' ORDER BY "createdAt") AS titles FROM "VisitDiagnosis" GROUP BY "visitId") d
WHERE h."sourceVisitId" = d."visitId";
-- Closed stays must not continue to generate overdue tasks. Keep the original plan.
UPDATE "HospitalRecord" r SET "recordStatus" = 'SKIPPED', "cancelledAt" = COALESCE(h."completedAt", CURRENT_TIMESTAMP)
FROM "HospitalStay" h WHERE r."visitId" = h."sourceVisitId" AND h."status" <> 'ACTIVE' AND r."recordStatus" = 'PLANNED';
