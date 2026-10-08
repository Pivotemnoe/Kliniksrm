ALTER TABLE "OnlineAppointmentRequest" ADD COLUMN "assignedEmployeeId" TEXT, ADD COLUMN "claimedAt" TIMESTAMP(3);
CREATE TABLE "OnlineRequestSnooze" (
  "requestId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "until" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OnlineRequestSnooze_pkey" PRIMARY KEY ("requestId", "employeeId")
);
CREATE INDEX "OnlineAppointmentRequest_assignedEmployeeId_status_idx" ON "OnlineAppointmentRequest"("assignedEmployeeId", "status");
ALTER TABLE "OnlineAppointmentRequest" ADD CONSTRAINT "OnlineAppointmentRequest_assignedEmployeeId_fkey" FOREIGN KEY ("assignedEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OnlineRequestSnooze" ADD CONSTRAINT "OnlineRequestSnooze_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "OnlineAppointmentRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OnlineRequestSnooze" ADD CONSTRAINT "OnlineRequestSnooze_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
