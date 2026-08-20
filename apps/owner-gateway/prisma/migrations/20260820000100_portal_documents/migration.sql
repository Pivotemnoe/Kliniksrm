CREATE TABLE "PortalDocument" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sourceFileId" TEXT NOT NULL,
    "animalId" TEXT,
    "animalName" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "checksumSha256" TEXT,
    "archiveCategory" TEXT,
    "documentDate" TIMESTAMP(3),
    "sourceLabel" TEXT,
    "content" BYTEA,
    "contentStoredAt" TIMESTAMP(3),
    "sourceCreatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PortalDocument_ownerId_sourceFileId_key" ON "PortalDocument"("ownerId", "sourceFileId");
CREATE INDEX "PortalDocument_ownerId_sourceCreatedAt_idx" ON "PortalDocument"("ownerId", "sourceCreatedAt");

ALTER TABLE "PortalDocument" ADD CONSTRAINT "PortalDocument_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "OwnerSnapshot"("ownerId") ON DELETE CASCADE ON UPDATE CASCADE;
