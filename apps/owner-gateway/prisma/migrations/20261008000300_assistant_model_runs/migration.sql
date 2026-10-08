CREATE TABLE "ClinicAssistantRun" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "model" TEXT,
  "reservedMicroUsd" INTEGER NOT NULL DEFAULT 0,
  "chargedMicroUsd" INTEGER,
  "inputTokens" INTEGER,
  "outputTokens" INTEGER,
  "intent" TEXT,
  "errorCode" TEXT,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClinicAssistantRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClinicAssistantRun_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ClinicChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ClinicAssistantRun_cost_check" CHECK ("reservedMicroUsd" >= 0 AND ("chargedMicroUsd" IS NULL OR "chargedMicroUsd" >= 0)),
  CONSTRAINT "ClinicAssistantRun_status_check" CHECK ("status" IN ('PENDING','RUNNING','DONE','FAILED','SKIPPED'))
);
CREATE UNIQUE INDEX "ClinicAssistantRun_messageId_key" ON "ClinicAssistantRun"("messageId");
CREATE INDEX "ClinicAssistantRun_status_createdAt_idx" ON "ClinicAssistantRun"("status", "createdAt");
CREATE INDEX "ClinicAssistantRun_startedAt_idx" ON "ClinicAssistantRun"("startedAt");
