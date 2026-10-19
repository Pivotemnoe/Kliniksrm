CREATE TABLE "GroomingRequest" (
 "id" TEXT NOT NULL, "clientRequestId" TEXT NOT NULL, "inputHash" TEXT NOT NULL,
 "contactName" TEXT NOT NULL, "phone" TEXT NOT NULL, "petName" TEXT NOT NULL,
 "breedId" TEXT NOT NULL, "serviceId" TEXT NOT NULL, "preferredDate" TEXT,
 "timeWindow" TEXT NOT NULL, "notes" TEXT NOT NULL, "looks" JSONB NOT NULL,
 "consentVersion" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'NEW',
 "crmRequestId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "GroomingRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GroomingRequest_clientRequestId_key" ON "GroomingRequest"("clientRequestId");
CREATE INDEX "GroomingRequest_status_createdAt_idx" ON "GroomingRequest"("status","createdAt");
CREATE TABLE "GroomingMaxDelivery" (
 "id" TEXT NOT NULL, "requestId" TEXT NOT NULL, "recipientId" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING', "attempts" INTEGER NOT NULL DEFAULT 0,
 "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "startedAt" TIMESTAMP(3), "providerMessageId" TEXT, "errorCode" TEXT, "sentAt" TIMESTAMP(3),
 CONSTRAINT "GroomingMaxDelivery_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "GroomingMaxDelivery_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "GroomingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GroomingMaxDelivery_requestId_recipientId_key" ON "GroomingMaxDelivery"("requestId","recipientId");
CREATE INDEX "GroomingMaxDelivery_status_nextAttemptAt_idx" ON "GroomingMaxDelivery"("status","nextAttemptAt");
