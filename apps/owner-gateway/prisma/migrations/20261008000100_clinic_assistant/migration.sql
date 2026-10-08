-- AlterTable
ALTER TABLE "PortalInvitation" ADD COLUMN     "maxLinkedUserId" TEXT;

-- CreateTable
CREATE TABLE "ClinicConversation" (
    "id" TEXT NOT NULL,
    "sessionHash" TEXT,
    "sessionExpiresAt" TIMESTAMP(3),
    "ownerId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'SITE_CHAT',
    "mode" TEXT NOT NULL DEFAULT 'ASSISTANT',
    "needsAttention" BOOLEAN NOT NULL DEFAULT false,
    "contactName" TEXT,
    "phone" TEXT,
    "animalNickname" TEXT,
    "preferredAt" TIMESTAMP(3),
    "contactConsent" BOOLEAN NOT NULL DEFAULT false,
    "maxUserId" TEXT,
    "maxConsent" BOOLEAN NOT NULL DEFAULT false,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "acknowledgedSequence" INTEGER NOT NULL DEFAULT 0,
    "crmRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicChatMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "author" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "deliveryStatus" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "providerMessageId" TEXT,
    "attemptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicChatLink" (
    "tokenHash" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "ClinicChatLink_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClinicConversation_sessionHash_key" ON "ClinicConversation"("sessionHash");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicConversation_maxUserId_key" ON "ClinicConversation"("maxUserId");

-- CreateIndex
CREATE INDEX "ClinicConversation_needsAttention_updatedAt_idx" ON "ClinicConversation"("needsAttention", "updatedAt");

-- CreateIndex
CREATE INDEX "ClinicChatMessage_deliveryStatus_createdAt_idx" ON "ClinicChatMessage"("deliveryStatus", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicChatMessage_conversationId_clientKey_key" ON "ClinicChatMessage"("conversationId", "clientKey");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicChatMessage_conversationId_sequence_key" ON "ClinicChatMessage"("conversationId", "sequence");

-- AddForeignKey
ALTER TABLE "ClinicConversation" ADD CONSTRAINT "ClinicConversation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "OwnerSnapshot"("ownerId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicChatMessage" ADD CONSTRAINT "ClinicChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ClinicConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicChatLink" ADD CONSTRAINT "ClinicChatLink_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ClinicConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

