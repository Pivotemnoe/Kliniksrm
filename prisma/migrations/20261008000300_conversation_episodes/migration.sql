DROP INDEX "OnlineAppointmentRequest_conversationId_key";
CREATE INDEX "OnlineAppointmentRequest_conversationId_createdAt_idx" ON "OnlineAppointmentRequest"("conversationId", "createdAt");
