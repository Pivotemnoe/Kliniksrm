CREATE TABLE "ClinicBookingOperation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "conversationId" TEXT NOT NULL REFERENCES "ClinicConversation"("id") ON DELETE CASCADE,
  "ownerId" TEXT NOT NULL,
  "clientKey" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('OPTIONS', 'CONFIRM')),
  "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING', 'DONE', 'FAILED')),
  "bookingSequence" INTEGER,
  "input" JSONB NOT NULL,
  "result" JSONB,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "ClinicBookingOperation_conversationId_clientKey_key" ON "ClinicBookingOperation"("conversationId", "clientKey");
CREATE INDEX "ClinicBookingOperation_status_createdAt_idx" ON "ClinicBookingOperation"("status", "createdAt");
