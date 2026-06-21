-- CreateTable
CREATE TABLE "AnimalSpecies" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnimalSpecies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalBreed" (
    "id" TEXT NOT NULL,
    "speciesId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnimalBreed_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnimalSpecies_code_key" ON "AnimalSpecies"("code");

-- CreateIndex
CREATE UNIQUE INDEX "AnimalSpecies_title_key" ON "AnimalSpecies"("title");

-- CreateIndex
CREATE INDEX "AnimalSpecies_sortOrder_idx" ON "AnimalSpecies"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "AnimalBreed_speciesId_title_key" ON "AnimalBreed"("speciesId", "title");

-- CreateIndex
CREATE INDEX "AnimalBreed_speciesId_sortOrder_idx" ON "AnimalBreed"("speciesId", "sortOrder");

-- CreateIndex
CREATE INDEX "AnimalBreed_title_idx" ON "AnimalBreed"("title");

-- AddForeignKey
ALTER TABLE "AnimalBreed" ADD CONSTRAINT "AnimalBreed_speciesId_fkey" FOREIGN KEY ("speciesId") REFERENCES "AnimalSpecies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
