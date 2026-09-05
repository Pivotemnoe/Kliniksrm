BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE "PublicClinicCatalog" (
  "id" TEXT NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "payload" JSONB NOT NULL,
  CONSTRAINT "PublicClinicCatalog_pkey" PRIMARY KEY ("id")
);
INSERT INTO "_prisma_migrations" (id,checksum,finished_at,migration_name,started_at,applied_steps_count)
VALUES ('b3fde7fc-cf12-4dfd-b0d2-9a0b1bef68b1','0394ae5b6aa2fc9c383f90c4ecd148f05f298b600fec94214cbfc20f4b17a391',CURRENT_TIMESTAMP,'20260905130000_public_service_catalog',CURRENT_TIMESTAMP,1);
COMMIT;
