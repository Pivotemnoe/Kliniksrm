CREATE TABLE "LaboratoryTest" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT,
    "code" TEXT,
    "title" TEXT NOT NULL,
    "groupName" TEXT,
    "material" TEXT,
    "method" TEXT,
    "unit" TEXT,
    "referenceRange" TEXT,
    "species" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LaboratoryTest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LaboratoryProfile" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT,
    "code" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "species" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LaboratoryProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LaboratoryProfileTest" (
    "profileId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LaboratoryProfileTest_pkey" PRIMARY KEY ("profileId","testId")
);

CREATE INDEX "LaboratoryTest_title_idx" ON "LaboratoryTest"("title");
CREATE INDEX "LaboratoryTest_code_idx" ON "LaboratoryTest"("code");
CREATE INDEX "LaboratoryTest_groupName_idx" ON "LaboratoryTest"("groupName");
CREATE INDEX "LaboratoryTest_serviceId_idx" ON "LaboratoryTest"("serviceId");
CREATE INDEX "LaboratoryTest_isActive_idx" ON "LaboratoryTest"("isActive");
CREATE INDEX "LaboratoryProfile_title_idx" ON "LaboratoryProfile"("title");
CREATE INDEX "LaboratoryProfile_code_idx" ON "LaboratoryProfile"("code");
CREATE INDEX "LaboratoryProfile_serviceId_idx" ON "LaboratoryProfile"("serviceId");
CREATE INDEX "LaboratoryProfile_isActive_idx" ON "LaboratoryProfile"("isActive");
CREATE INDEX "LaboratoryProfileTest_testId_idx" ON "LaboratoryProfileTest"("testId");
CREATE INDEX "LaboratoryProfileTest_profileId_sortOrder_idx" ON "LaboratoryProfileTest"("profileId", "sortOrder");

ALTER TABLE "LaboratoryTest" ADD CONSTRAINT "LaboratoryTest_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LaboratoryProfile" ADD CONSTRAINT "LaboratoryProfile_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LaboratoryProfileTest" ADD CONSTRAINT "LaboratoryProfileTest_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "LaboratoryProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LaboratoryProfileTest" ADD CONSTRAINT "LaboratoryProfileTest_testId_fkey" FOREIGN KEY ("testId") REFERENCES "LaboratoryTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
