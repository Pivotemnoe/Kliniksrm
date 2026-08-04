-- CreateEnum
CREATE TYPE "DocumentEventType" AS ENUM ('CREATED', 'GENERATED', 'SIGNED', 'CANCELLED', 'DELIVERY_QUEUED', 'PRINTED');

-- CreateEnum
CREATE TYPE "DocumentSignatureMethod" AS ENUM ('PAPER', 'ELECTRONIC', 'STATUS_CONFIRMATION');

-- AlterTable
ALTER TABLE "DocumentTemplate"
ADD COLUMN "currentVersion" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "DocumentTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "categoryTitle" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "variables" JSONB,
    "createdById" TEXT,
    "createdByName" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- Preserve the current state of every legacy template as version 1 without
-- changing the template or any already rendered visit document.
INSERT INTO "DocumentTemplateVersion" (
    "id",
    "templateId",
    "version",
    "categoryTitle",
    "title",
    "body",
    "variables",
    "publishedAt",
    "createdAt"
)
SELECT
    gen_random_uuid()::text,
    template."id",
    1,
    category."title",
    template."title",
    template."body",
    template."variables",
    template."updatedAt",
    CURRENT_TIMESTAMP
FROM "DocumentTemplate" AS template
LEFT JOIN "DocumentTemplateCategory" AS category ON category."id" = template."categoryId";

-- AlterTable
ALTER TABLE "VisitDocument"
ADD COLUMN "templateVersionId" TEXT;

-- AlterTable
ALTER TABLE "GeneratedDocument"
ADD COLUMN "templateVersionId" TEXT,
ADD COLUMN "snapshot" JSONB,
ADD COLUMN "contentSha256" TEXT,
ADD COLUMN "pdfSha256" TEXT,
ADD COLUMN "generatedById" TEXT,
ADD COLUMN "generatedByName" TEXT,
ADD COLUMN "generatedAt" TIMESTAMP(3),
ADD COLUMN "signedById" TEXT,
ADD COLUMN "signedByName" TEXT,
ADD COLUMN "signedAt" TIMESTAMP(3),
ADD COLUMN "signatureMethod" "DocumentSignatureMethod";

-- CreateTable
CREATE TABLE "DocumentEvent" (
    "id" TEXT NOT NULL,
    "visitDocumentId" TEXT NOT NULL,
    "type" "DocumentEventType" NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "channel" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentEvent_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "NotificationOutbox"
ADD COLUMN "visitDocumentId" TEXT;

-- AlterTable
ALTER TABLE "FileObject"
ADD COLUMN "ownerId" TEXT,
ADD COLUMN "animalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTemplateVersion_templateId_version_key" ON "DocumentTemplateVersion"("templateId", "version");

-- CreateIndex
CREATE INDEX "DocumentTemplateVersion_templateId_publishedAt_idx" ON "DocumentTemplateVersion"("templateId", "publishedAt");

-- CreateIndex
CREATE INDEX "VisitDocument_templateVersionId_idx" ON "VisitDocument"("templateVersionId");

-- CreateIndex
CREATE INDEX "GeneratedDocument_templateVersionId_idx" ON "GeneratedDocument"("templateVersionId");

-- CreateIndex
CREATE INDEX "GeneratedDocument_contentSha256_idx" ON "GeneratedDocument"("contentSha256");

-- CreateIndex
CREATE INDEX "DocumentEvent_visitDocumentId_createdAt_idx" ON "DocumentEvent"("visitDocumentId", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentEvent_type_createdAt_idx" ON "DocumentEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationOutbox_visitDocumentId_idx" ON "NotificationOutbox"("visitDocumentId");

-- CreateIndex
CREATE INDEX "FileObject_ownerId_idx" ON "FileObject"("ownerId");

-- CreateIndex
CREATE INDEX "FileObject_animalId_idx" ON "FileObject"("animalId");

-- AddForeignKey
ALTER TABLE "DocumentTemplateVersion" ADD CONSTRAINT "DocumentTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitDocument" ADD CONSTRAINT "VisitDocument_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "DocumentTemplateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "DocumentTemplateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentEvent" ADD CONSTRAINT "DocumentEvent_visitDocumentId_fkey" FOREIGN KEY ("visitDocumentId") REFERENCES "VisitDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_visitDocumentId_fkey" FOREIGN KEY ("visitDocumentId") REFERENCES "VisitDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
