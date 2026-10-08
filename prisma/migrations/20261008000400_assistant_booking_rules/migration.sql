ALTER TABLE "OnlineAppointmentRequest" ADD COLUMN "assistantBookingKey" TEXT,
  ADD COLUMN "assistantBookingFingerprint" TEXT,
  ADD COLUMN "assistantBookingSequence" INTEGER;
CREATE UNIQUE INDEX "OnlineAppointmentRequest_assistantBookingKey_key" ON "OnlineAppointmentRequest"("assistantBookingKey");
CREATE UNIQUE INDEX "OnlineAppointmentRequest_conversationId_assistantBookingSequence_key" ON "OnlineAppointmentRequest"("conversationId", "assistantBookingSequence");
CREATE TABLE "AssistantBookingRule" (
  "id" TEXT NOT NULL,
  "officeId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "durationMinutes" INTEGER NOT NULL DEFAULT 30,
  "stepMinutes" INTEGER NOT NULL DEFAULT 15,
  "minimumLeadMinutes" INTEGER NOT NULL DEFAULT 60,
  "maximumDaysAhead" INTEGER NOT NULL DEFAULT 14,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssistantBookingRule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssistantBookingRule_duration_check" CHECK ("durationMinutes" BETWEEN 5 AND 240 AND "durationMinutes" % 5 = 0),
  CONSTRAINT "AssistantBookingRule_step_check" CHECK ("stepMinutes" BETWEEN 5 AND 60 AND "stepMinutes" % 5 = 0),
  CONSTRAINT "AssistantBookingRule_lead_check" CHECK ("minimumLeadMinutes" BETWEEN 0 AND 10080),
  CONSTRAINT "AssistantBookingRule_horizon_check" CHECK ("maximumDaysAhead" BETWEEN 1 AND 60),
  CONSTRAINT "AssistantBookingRule_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "ClinicOffice"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AssistantBookingRule_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AssistantBookingRule_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AssistantBookingRule_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AssistantBookingRule_officeId_serviceId_employeeId_roomId_key" ON "AssistantBookingRule"("officeId", "serviceId", "employeeId", "roomId");
CREATE INDEX "AssistantBookingRule_isActive_serviceId_idx" ON "AssistantBookingRule"("isActive", "serviceId");
