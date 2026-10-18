ALTER TABLE "OnlineAppointmentRequest" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "OnlineAppointmentRequest" ADD COLUMN "deletedById" TEXT;
CREATE INDEX "OnlineAppointmentRequest_deletedAt_createdAt_idx" ON "OnlineAppointmentRequest"("deletedAt", "createdAt");
