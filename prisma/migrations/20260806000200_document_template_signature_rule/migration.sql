-- Existing templates remain ordinary documents. Clinic administrators can
-- explicitly enable signature confirmation for consents and other official
-- forms without changing previously generated documents.
ALTER TABLE "DocumentTemplate"
ADD COLUMN "requiresSignature" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "DocumentTemplateVersion"
ADD COLUMN "requiresSignature" BOOLEAN NOT NULL DEFAULT false;
