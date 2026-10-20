CREATE TABLE "AvitoListingSnapshot" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "items" JSONB NOT NULL,
    "nextPage" INTEGER,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AvitoListingSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AvitoListingSnapshot_integrationId_status_page_key"
    ON "AvitoListingSnapshot"("integrationId", "status", "page");

ALTER TABLE "AvitoListingSnapshot" ADD CONSTRAINT "AvitoListingSnapshot_integrationId_fkey"
    FOREIGN KEY ("integrationId") REFERENCES "AvitoIntegration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
