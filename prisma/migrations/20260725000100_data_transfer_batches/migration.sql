-- Additive audit trail for safe, repeatable data transfer.
-- Existing clinical tables and records are intentionally not changed.
CREATE TYPE "DataTransferStatus" AS ENUM (
  'DRAFT',
  'PREVIEWED',
  'IMPORTING',
  'COMPLETED',
  'COMPLETED_WITH_ERRORS',
  'ROLLING_BACK',
  'ROLLED_BACK',
  'ROLLBACK_BLOCKED',
  'FAILED'
);

CREATE TYPE "DataTransferRowStatus" AS ENUM (
  'PENDING',
  'READY',
  'SKIPPED',
  'IMPORTED',
  'FAILED',
  'ROLLED_BACK'
);

CREATE TYPE "DataTransferAction" AS ENUM ('CREATED', 'MATCHED');

CREATE TABLE "DataTransferBatch" (
  "id" TEXT NOT NULL,
  "sourceSystem" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "originalFileName" TEXT,
  "fileChecksum" TEXT NOT NULL,
  "status" "DataTransferStatus" NOT NULL DEFAULT 'DRAFT',
  "totalRows" INTEGER NOT NULL DEFAULT 0,
  "readyRows" INTEGER NOT NULL DEFAULT 0,
  "importedRows" INTEGER NOT NULL DEFAULT 0,
  "skippedRows" INTEGER NOT NULL DEFAULT 0,
  "failedRows" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "rolledBackAt" TIMESTAMP(3),
  "errorSummary" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DataTransferBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DataTransferRow" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "rowNumber" INTEGER NOT NULL,
  "sourceId" TEXT,
  "fingerprint" TEXT NOT NULL,
  "status" "DataTransferRowStatus" NOT NULL DEFAULT 'PENDING',
  "rawData" JSONB NOT NULL,
  "normalizedData" JSONB,
  "result" JSONB,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DataTransferRow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DataTransferFieldMapping" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "sourceColumn" TEXT NOT NULL,
  "targetField" TEXT NOT NULL,
  "transform" TEXT,
  "required" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataTransferFieldMapping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DataTransferEntityLink" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "rowId" TEXT,
  "sourceEntityType" TEXT NOT NULL,
  "sourceEntityId" TEXT,
  "targetEntityType" TEXT NOT NULL,
  "targetEntityId" TEXT NOT NULL,
  "action" "DataTransferAction" NOT NULL,
  "rollbackEligible" BOOLEAN NOT NULL DEFAULT false,
  "rolledBackAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataTransferEntityLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DataTransferBatch_sourceSystem_kind_fileChecksum_key"
  ON "DataTransferBatch"("sourceSystem", "kind", "fileChecksum");
CREATE INDEX "DataTransferBatch_status_createdAt_idx" ON "DataTransferBatch"("status", "createdAt");
CREATE INDEX "DataTransferBatch_createdById_idx" ON "DataTransferBatch"("createdById");
CREATE UNIQUE INDEX "DataTransferRow_batchId_rowNumber_key" ON "DataTransferRow"("batchId", "rowNumber");
CREATE INDEX "DataTransferRow_batchId_status_idx" ON "DataTransferRow"("batchId", "status");
CREATE INDEX "DataTransferRow_fingerprint_idx" ON "DataTransferRow"("fingerprint");
CREATE UNIQUE INDEX "DataTransferFieldMapping_batchId_sourceColumn_key"
  ON "DataTransferFieldMapping"("batchId", "sourceColumn");
CREATE INDEX "DataTransferFieldMapping_batchId_targetField_idx"
  ON "DataTransferFieldMapping"("batchId", "targetField");
CREATE INDEX "DataTransferEntityLink_batchId_action_idx" ON "DataTransferEntityLink"("batchId", "action");
CREATE INDEX "DataTransferEntityLink_rowId_idx" ON "DataTransferEntityLink"("rowId");
CREATE INDEX "DataTransferEntityLink_targetEntityType_targetEntityId_idx"
  ON "DataTransferEntityLink"("targetEntityType", "targetEntityId");
CREATE INDEX "DataTransferEntityLink_sourceEntityType_sourceEntityId_idx"
  ON "DataTransferEntityLink"("sourceEntityType", "sourceEntityId");

ALTER TABLE "DataTransferBatch"
  ADD CONSTRAINT "DataTransferBatch_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DataTransferRow"
  ADD CONSTRAINT "DataTransferRow_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "DataTransferBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataTransferFieldMapping"
  ADD CONSTRAINT "DataTransferFieldMapping_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "DataTransferBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataTransferEntityLink"
  ADD CONSTRAINT "DataTransferEntityLink_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "DataTransferBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataTransferEntityLink"
  ADD CONSTRAINT "DataTransferEntityLink_rowId_fkey"
  FOREIGN KEY ("rowId") REFERENCES "DataTransferRow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
