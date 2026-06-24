-- Employee work shifts and optional login restriction by active shift.
ALTER TABLE "Employee"
ADD COLUMN "restrictLoginToShifts" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "EmployeeShift" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "comment" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EmployeeShift_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "EmployeeShift"
ADD CONSTRAINT "EmployeeShift_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "EmployeeShift_employeeId_startsAt_idx" ON "EmployeeShift"("employeeId", "startsAt");
CREATE INDEX "EmployeeShift_startsAt_endsAt_idx" ON "EmployeeShift"("startsAt", "endsAt");
