-- CreateTable
CREATE TABLE "GroomingPortalOperation" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "error" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "GroomingPortalOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroomingRegistration" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "browserTokenHash" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "maxUserId" TEXT,
    "ownerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'WAITING_MAX',
    "error" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroomingRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroomingStaffDelivery" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroomingStaffDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroomingBookingDraft" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "consumedByOwnerId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroomingBookingDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroomingPortalOperation_status_createdAt_idx" ON "GroomingPortalOperation"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GroomingPortalOperation_ownerId_clientKey_key" ON "GroomingPortalOperation"("ownerId", "clientKey");

-- CreateIndex
CREATE UNIQUE INDEX "GroomingRegistration_tokenHash_key" ON "GroomingRegistration"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "GroomingRegistration_browserTokenHash_key" ON "GroomingRegistration"("browserTokenHash");

-- CreateIndex
CREATE INDEX "GroomingRegistration_status_createdAt_idx" ON "GroomingRegistration"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GroomingBookingDraft_tokenHash_key" ON "GroomingBookingDraft"("tokenHash");

-- CreateIndex
CREATE INDEX "GroomingBookingDraft_ipHash_createdAt_idx" ON "GroomingBookingDraft"("ipHash", "createdAt");

-- CreateIndex
CREATE INDEX "GroomingBookingDraft_expiresAt_idx" ON "GroomingBookingDraft"("expiresAt");

-- AddForeignKey
ALTER TABLE "GroomingPortalOperation" ADD CONSTRAINT "GroomingPortalOperation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "OwnerSnapshot"("ownerId") ON DELETE RESTRICT ON UPDATE CASCADE;

