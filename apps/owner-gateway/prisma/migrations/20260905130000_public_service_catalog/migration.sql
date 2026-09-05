CREATE TABLE "PublicClinicCatalog" (
  "id" TEXT NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "payload" JSONB NOT NULL,
  CONSTRAINT "PublicClinicCatalog_pkey" PRIMARY KEY ("id")
);
