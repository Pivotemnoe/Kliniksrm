-- A durable event is recorded once when an in-progress visit crosses the
-- one-hour threshold. It supports audit history and daily reporting without
-- changing or deleting any clinical record.
CREATE TABLE "VisitOverdueAlert" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "employeeId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "overdueAt" TIMESTAMP(3) NOT NULL,
    "thresholdMinutes" INTEGER NOT NULL DEFAULT 60,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitOverdueAlert_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VisitOverdueAlert_visitId_key" ON "VisitOverdueAlert"("visitId");
CREATE INDEX "VisitOverdueAlert_overdueAt_idx" ON "VisitOverdueAlert"("overdueAt");
CREATE INDEX "VisitOverdueAlert_employeeId_overdueAt_idx" ON "VisitOverdueAlert"("employeeId", "overdueAt");

ALTER TABLE "VisitOverdueAlert"
ADD CONSTRAINT "VisitOverdueAlert_visitId_fkey"
FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VisitOverdueAlert"
ADD CONSTRAINT "VisitOverdueAlert_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
