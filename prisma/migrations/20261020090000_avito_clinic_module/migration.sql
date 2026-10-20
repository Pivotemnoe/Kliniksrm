-- Additive Avito integration over the existing grooming module catalog.
BEGIN;


-- CreateTable
CREATE TABLE "AvitoIntegration" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "accountId" TEXT,
    "accountName" TEXT,
    "checkedAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "connectionError" TEXT,
    "settings" JSONB NOT NULL,
    "settingsVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvitoIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvitoSettingsRevision" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "settings" JSONB NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvitoSettingsRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvitoConversation" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "externalChatId" TEXT NOT NULL,
    "listingId" TEXT,
    "listingTitle" TEXT,
    "customerName" TEXT,
    "direction" TEXT NOT NULL DEFAULT 'UNASSIGNED',
    "mode" TEXT NOT NULL DEFAULT 'BOT',
    "stage" TEXT NOT NULL DEFAULT 'NEW',
    "needsAttention" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "contact" JSONB NOT NULL,
    "intakeCycle" INTEGER NOT NULL DEFAULT 1,
    "requestId" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvitoConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvitoMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "authorId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvitoMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvitoOutgoingOperation" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "triggerMessageId" TEXT,
    "crmQuery" TEXT,
    "text" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'REPLY',
    "consentFingerprint" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "actorId" TEXT,
    "conversationVersion" INTEGER NOT NULL,
    "settingsVersion" INTEGER NOT NULL,
    "externalMessageId" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvitoOutgoingOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvitoIncomingEvent" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "externalChatId" TEXT NOT NULL,
    "externalMessageId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvitoIncomingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvitoCall" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "missed" BOOLEAN NOT NULL DEFAULT false,
    "direction" TEXT NOT NULL DEFAULT 'CLINIC',
    "note" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvitoCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvitoInquiry" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "requestId" TEXT,
    "direction" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "consentMessageId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvitoInquiry_pkey" PRIMARY KEY ("id")
);


-- CreateIndex
CREATE UNIQUE INDEX "AvitoIntegration_installationId_key" ON "AvitoIntegration"("installationId");

-- CreateIndex
CREATE UNIQUE INDEX "AvitoIntegration_accountId_key" ON "AvitoIntegration"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "AvitoSettingsRevision_integrationId_version_key" ON "AvitoSettingsRevision"("integrationId", "version");

-- CreateIndex
CREATE INDEX "AvitoConversation_integrationId_needsAttention_lastMessageA_idx" ON "AvitoConversation"("integrationId", "needsAttention", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "AvitoConversation_integrationId_externalChatId_key" ON "AvitoConversation"("integrationId", "externalChatId");

-- CreateIndex
CREATE INDEX "AvitoMessage_conversationId_occurredAt_idx" ON "AvitoMessage"("conversationId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "AvitoMessage_conversationId_externalId_key" ON "AvitoMessage"("conversationId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "AvitoOutgoingOperation_clientKey_key" ON "AvitoOutgoingOperation"("clientKey");

-- CreateIndex
CREATE INDEX "AvitoOutgoingOperation_status_createdAt_idx" ON "AvitoOutgoingOperation"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AvitoOutgoingOperation_conversationId_externalMessageId_idx" ON "AvitoOutgoingOperation"("conversationId", "externalMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "AvitoIncomingEvent_eventKey_key" ON "AvitoIncomingEvent"("eventKey");

-- CreateIndex
CREATE INDEX "AvitoIncomingEvent_status_createdAt_idx" ON "AvitoIncomingEvent"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AvitoCall_integrationId_occurredAt_idx" ON "AvitoCall"("integrationId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "AvitoCall_integrationId_clientKey_key" ON "AvitoCall"("integrationId", "clientKey");

-- CreateIndex
CREATE UNIQUE INDEX "AvitoInquiry_clientKey_key" ON "AvitoInquiry"("clientKey");
CREATE UNIQUE INDEX "AvitoInquiry_requestId_key" ON "AvitoInquiry"("requestId");

-- CreateIndex
CREATE INDEX "AvitoInquiry_direction_status_createdAt_idx" ON "AvitoInquiry"("direction", "status", "createdAt");


-- AddForeignKey
ALTER TABLE "AvitoIntegration" ADD CONSTRAINT "AvitoIntegration_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "ClinicModuleInstallation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvitoSettingsRevision" ADD CONSTRAINT "AvitoSettingsRevision_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "AvitoIntegration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvitoConversation" ADD CONSTRAINT "AvitoConversation_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "AvitoIntegration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvitoConversation" ADD CONSTRAINT "AvitoConversation_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "OnlineAppointmentRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvitoMessage" ADD CONSTRAINT "AvitoMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AvitoConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvitoOutgoingOperation" ADD CONSTRAINT "AvitoOutgoingOperation_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AvitoConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvitoIncomingEvent" ADD CONSTRAINT "AvitoIncomingEvent_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "AvitoIntegration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvitoCall" ADD CONSTRAINT "AvitoCall_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "AvitoIntegration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvitoInquiry" ADD CONSTRAINT "AvitoInquiry_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AvitoConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AvitoInquiry" ADD CONSTRAINT "AvitoInquiry_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "OnlineAppointmentRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Add-on permissions are separate from general clinic settings. Existing employee DENY overrides remain intact.
INSERT INTO "Permission" ("id", "code", "title", "updatedAt") VALUES
('avito-permission-read', 'avito.read', 'Просмотр обращений Авито', CURRENT_TIMESTAMP),
('avito-permission-operate', 'avito.operate', 'Обработка обращений Авито', CURRENT_TIMESTAMP),
('avito-permission-manage', 'avito.manage', 'Подключение и настройки Авито', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r CROSS JOIN "Permission" p
WHERE (r."code" = 'director' AND p."code" IN ('avito.read', 'avito.operate', 'avito.manage'))
OR (r."code" = 'administrator' AND p."code" IN ('avito.read', 'avito.operate'))
ON CONFLICT DO NOTHING;


-- Existing evidence and its physical columns are preserved. New inquiries record
-- a client-provided callback number, separately from historical confirmations.
ALTER TABLE "AvitoInquiry" ADD COLUMN "contactBasis" TEXT NOT NULL DEFAULT 'EXPLICIT_CONFIRMATION';
ALTER TABLE "AvitoOutgoingOperation" ADD COLUMN "replyContext" JSONB;

-- Local Avito editor only. No changes to clinical, stock or grooming records.
ALTER TABLE "AvitoIntegration" ADD COLUMN "publishingCheck" JSONB;
CREATE TABLE "AvitoListingDraft" (
  "id" TEXT NOT NULL,
  "integrationId" TEXT NOT NULL,
  "clientKey" TEXT NOT NULL,
  "sourceListingId" TEXT,
  "direction" TEXT NOT NULL DEFAULT 'CLINIC',
  "title" TEXT NOT NULL,
  "content" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "approvedFactsHash" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AvitoListingDraft_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AvitoListingDraftRevision" (
  "id" TEXT NOT NULL,
  "draftId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AvitoListingDraftRevision_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AvitoListingMedia" (
  "id" TEXT NOT NULL,
  "draftId" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "bytes" BYTEA NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AvitoListingMedia_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AvitoListingDraft_integrationId_updatedAt_idx" ON "AvitoListingDraft"("integrationId", "updatedAt");
CREATE UNIQUE INDEX "AvitoListingDraft_integrationId_clientKey_key" ON "AvitoListingDraft"("integrationId", "clientKey");
CREATE UNIQUE INDEX "AvitoListingDraftRevision_draftId_version_key" ON "AvitoListingDraftRevision"("draftId", "version");
CREATE UNIQUE INDEX "AvitoListingMedia_draftId_sha256_key" ON "AvitoListingMedia"("draftId", "sha256");
ALTER TABLE "AvitoListingDraft" ADD CONSTRAINT "AvitoListingDraft_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "AvitoIntegration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AvitoListingDraftRevision" ADD CONSTRAINT "AvitoListingDraftRevision_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "AvitoListingDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AvitoListingMedia" ADD CONSTRAINT "AvitoListingMedia_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "AvitoListingDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
