ALTER TABLE "OnlineAppointmentRequest" ADD COLUMN "conversationId" TEXT, ADD COLUMN "conversationVersion" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "conversationNeedsAttention" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "conversationSnapshot" JSONB;
CREATE UNIQUE INDEX "OnlineAppointmentRequest_conversationId_key" ON "OnlineAppointmentRequest"("conversationId");
