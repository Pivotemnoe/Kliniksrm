ALTER TABLE "MedicalPhrase" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "MedicalPhrase_field_isActive_idx" ON "MedicalPhrase"("field", "isActive");
