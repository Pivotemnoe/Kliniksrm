-- A paid laboratory analysis can use one existing document form. Historical
-- profiles, tests and order rows remain untouched; mappings are configured
-- manually by the clinic director because document semantics cannot be guessed.
ALTER TABLE "LaboratoryTest" ADD COLUMN "documentTemplateId" TEXT;
ALTER TABLE "LaboratoryOrder" ADD COLUMN "formSnapshots" JSONB;

CREATE INDEX "LaboratoryTest_documentTemplateId_idx" ON "LaboratoryTest"("documentTemplateId");

ALTER TABLE "LaboratoryTest"
  ADD CONSTRAINT "LaboratoryTest_documentTemplateId_fkey"
  FOREIGN KEY ("documentTemplateId") REFERENCES "DocumentTemplate"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
