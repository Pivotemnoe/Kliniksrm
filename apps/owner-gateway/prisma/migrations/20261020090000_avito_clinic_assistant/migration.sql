CREATE TABLE "AvitoAssistantRun" (
  "id" TEXT NOT NULL,
  "clientKey" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "reservedMicroUsd" INTEGER NOT NULL,
  "chargedMicroUsd" INTEGER,
  "result" JSONB,
  "errorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "AvitoAssistantRun_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AvitoAssistantRun_clientKey_key" ON "AvitoAssistantRun"("clientKey");
CREATE INDEX "AvitoAssistantRun_createdAt_idx" ON "AvitoAssistantRun"("createdAt");
