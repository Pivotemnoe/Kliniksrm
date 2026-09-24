ALTER TABLE "MedicalPhrase" ADD COLUMN "learnedVisitCount" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "MedicalPhraseLearning" (
  "phraseId" TEXT NOT NULL,
  "visitId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MedicalPhraseLearning_pkey" PRIMARY KEY ("phraseId", "visitId"),
  CONSTRAINT "MedicalPhraseLearning_phraseId_fkey" FOREIGN KEY ("phraseId") REFERENCES "MedicalPhrase"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MedicalPhraseLearning_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "MedicalPhraseLearning_visitId_idx" ON "MedicalPhraseLearning"("visitId");
