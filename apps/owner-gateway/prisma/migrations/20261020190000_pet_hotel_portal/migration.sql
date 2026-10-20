-- CreateTable
CREATE TABLE "PetHotelPortalOperation" (
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

    CONSTRAINT "PetHotelPortalOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetHotelBookingDraft" (
    "id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "consumedByOwnerId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PetHotelBookingDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetHotelStorefrontSnapshot" (
    "id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PetHotelStorefrontSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetHotelRegistration" (
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

    CONSTRAINT "PetHotelRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PetHotelPortalOperation_status_createdAt_idx" ON "PetHotelPortalOperation"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PetHotelPortalOperation_ownerId_clientKey_key" ON "PetHotelPortalOperation"("ownerId", "clientKey");

-- CreateIndex
CREATE UNIQUE INDEX "PetHotelBookingDraft_tokenHash_key" ON "PetHotelBookingDraft"("tokenHash");

-- CreateIndex
CREATE INDEX "PetHotelBookingDraft_ipHash_createdAt_idx" ON "PetHotelBookingDraft"("ipHash", "createdAt");

-- CreateIndex
CREATE INDEX "PetHotelBookingDraft_expiresAt_idx" ON "PetHotelBookingDraft"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PetHotelRegistration_tokenHash_key" ON "PetHotelRegistration"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "PetHotelRegistration_browserTokenHash_key" ON "PetHotelRegistration"("browserTokenHash");

-- CreateIndex
CREATE INDEX "PetHotelRegistration_status_createdAt_idx" ON "PetHotelRegistration"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "PetHotelPortalOperation" ADD CONSTRAINT "PetHotelPortalOperation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "OwnerSnapshot"("ownerId") ON DELETE RESTRICT ON UPDATE CASCADE;
