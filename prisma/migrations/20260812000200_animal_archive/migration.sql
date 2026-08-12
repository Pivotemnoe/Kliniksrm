ALTER TABLE "Animal"
ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "archiveReason" TEXT,
ADD COLUMN "archiveComment" TEXT,
ADD COLUMN "archivedById" TEXT;

CREATE INDEX "Animal_ownerId_archivedAt_idx" ON "Animal"("ownerId", "archivedAt");
CREATE INDEX "Animal_archivedAt_idx" ON "Animal"("archivedAt");
