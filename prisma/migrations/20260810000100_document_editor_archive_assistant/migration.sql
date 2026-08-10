-- Additive release: visual document layouts, patient archive metadata, and personal phrase assistant state.
ALTER TABLE "Employee"
ADD COLUMN "medicalPhraseAssistantEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "MedicalPhrase"
ADD COLUMN "isAccepted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "dismissedAt" TIMESTAMP(3);

-- Existing learned phrases have already been available to doctors. Preserve that behaviour after the migration.
UPDATE "MedicalPhrase"
SET "isAccepted" = true
WHERE "source" = 'EMPLOYEE' AND "usageCount" >= 2;

ALTER TABLE "DocumentTemplate"
ADD COLUMN "layout" JSONB;

ALTER TABLE "DocumentTemplateVersion"
ADD COLUMN "layout" JSONB;

ALTER TABLE "VisitDocument"
ADD COLUMN "layout" JSONB;

ALTER TABLE "FileObject"
ADD COLUMN "archiveCategory" TEXT,
ADD COLUMN "documentDate" TIMESTAMP(3),
ADD COLUMN "sourceLabel" TEXT,
ADD COLUMN "note" TEXT;

CREATE INDEX "FileObject_animalId_archiveCategory_documentDate_idx"
ON "FileObject"("animalId", "archiveCategory", "documentDate");
