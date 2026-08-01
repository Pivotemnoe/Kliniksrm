-- Additive organization branding fields. Existing organizations and clinic data stay unchanged.
ALTER TABLE "Organization"
  ADD COLUMN "logoStorageKey" TEXT,
  ADD COLUMN "logoOriginalName" TEXT,
  ADD COLUMN "logoMimeType" TEXT,
  ADD COLUMN "logoSizeBytes" INTEGER,
  ADD COLUMN "logoUpdatedAt" TIMESTAMP(3);
