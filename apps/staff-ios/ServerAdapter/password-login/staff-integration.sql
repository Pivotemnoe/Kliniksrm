BEGIN;

-- AlterTable
ALTER TABLE "InternalMessage" ADD COLUMN     "clientKey" TEXT;

-- CreateTable
CREATE TABLE "StaffNativePushDevice" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "remoteDeviceId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "tokenCiphertext" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffNativePushDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffNativePushEvent" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "conversationEmployeeId" TEXT,
    "channelId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffNativePushEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffNativePushDelivery" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'QUEUED',
    "attemptedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "providerReceipt" TEXT,

    CONSTRAINT "StaffNativePushDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffClinicChannel" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Общий чат клиники',
    "nextSequence" BIGINT NOT NULL DEFAULT 0,
    "sourceReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffClinicChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffClinicChatMembership" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "readThroughSequence" BIGINT NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffClinicChatMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffClinicChatMessage" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "sequence" BIGINT NOT NULL,
    "sourceKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffClinicChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffNativePushDevice_tokenHash_key" ON "StaffNativePushDevice"("tokenHash");

-- CreateIndex
CREATE INDEX "StaffNativePushDevice_employeeId_expiresAt_idx" ON "StaffNativePushDevice"("employeeId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "StaffNativePushDevice_platform_applicationId_installationId_key" ON "StaffNativePushDevice"("platform", "applicationId", "installationId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffNativePushEvent_dedupeKey_key" ON "StaffNativePushEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "StaffNativePushEvent_employeeId_createdAt_idx" ON "StaffNativePushEvent"("employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "StaffNativePushDelivery_state_attemptedAt_idx" ON "StaffNativePushDelivery"("state", "attemptedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StaffNativePushDelivery_eventId_deviceId_key" ON "StaffNativePushDelivery"("eventId", "deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffClinicChannel_organizationId_key" ON "StaffClinicChannel"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffClinicChatMembership_employeeId_key" ON "StaffClinicChatMembership"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffClinicChatMembership_channelId_employeeId_key" ON "StaffClinicChatMembership"("channelId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffClinicChatMessage_channelId_senderId_clientKey_key" ON "StaffClinicChatMessage"("channelId", "senderId", "clientKey");

-- CreateIndex
CREATE UNIQUE INDEX "StaffClinicChatMessage_channelId_sequence_key" ON "StaffClinicChatMessage"("channelId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "StaffClinicChatMessage_channelId_sourceKey_key" ON "StaffClinicChatMessage"("channelId", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "InternalMessage_senderId_clientKey_key" ON "InternalMessage"("senderId", "clientKey");

-- AddForeignKey
ALTER TABLE "StaffNativePushDevice" ADD CONSTRAINT "StaffNativePushDevice_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffNativePushDevice" ADD CONSTRAINT "StaffNativePushDevice_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffNativePushDevice" ADD CONSTRAINT "StaffNativePushDevice_remoteDeviceId_fkey" FOREIGN KEY ("remoteDeviceId") REFERENCES "RemoteAccessDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffNativePushDelivery" ADD CONSTRAINT "StaffNativePushDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "StaffNativePushEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffNativePushDelivery" ADD CONSTRAINT "StaffNativePushDelivery_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "StaffNativePushDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffClinicChannel" ADD CONSTRAINT "StaffClinicChannel_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffClinicChatMembership" ADD CONSTRAINT "StaffClinicChatMembership_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "StaffClinicChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffClinicChatMembership" ADD CONSTRAINT "StaffClinicChatMembership_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffClinicChatMessage" ADD CONSTRAINT "StaffClinicChatMessage_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "StaffClinicChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffClinicChatMessage" ADD CONSTRAINT "StaffClinicChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
