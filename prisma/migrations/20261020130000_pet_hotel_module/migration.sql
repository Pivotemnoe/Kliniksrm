BEGIN;
CREATE TABLE "PetHotelSettings" (
  "installationId" TEXT PRIMARY KEY REFERENCES "ClinicModuleInstallation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "dailyRate" DECIMAL(12,2) NOT NULL DEFAULT 700, "walkRate" DECIMAL(12,2) NOT NULL DEFAULT 150,
  "minimumDays" INTEGER NOT NULL DEFAULT 2, "maximumDogWeightKg" DECIMAL(6,2) NOT NULL DEFAULT 10,
  "checkInFrom" TEXT NOT NULL DEFAULT '09:00', "checkInTo" TEXT NOT NULL DEFAULT '18:00',
  "siteUrl" TEXT NOT NULL DEFAULT 'https://pet.temichevvet.ru/pet-hotel/',
  "version" INTEGER NOT NULL DEFAULT 1, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PetHotelSettings_nonnegative_rates" CHECK ("dailyRate" >= 0 AND "walkRate" >= 0 AND "minimumDays" >= 1 AND "maximumDogWeightKg" > 0)
);
CREATE TABLE "PetHotelRoom" (
  "id" TEXT PRIMARY KEY, "installationId" TEXT NOT NULL REFERENCES "ClinicModuleInstallation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "code" TEXT NOT NULL, "name" TEXT NOT NULL, "species" TEXT NOT NULL CHECK ("species" IN ('CAT','DOG')),
  "sortOrder" INTEGER NOT NULL DEFAULT 0, "isActive" BOOLEAN NOT NULL DEFAULT true, "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "PetHotelRoom_installationId_code_key" ON "PetHotelRoom"("installationId","code");
CREATE INDEX "PetHotelRoom_installationId_species_isActive_idx" ON "PetHotelRoom"("installationId","species","isActive");
CREATE TABLE "PetHotelReservation" (
  "id" TEXT PRIMARY KEY, "installationId" TEXT NOT NULL REFERENCES "ClinicModuleInstallation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "roomId" TEXT NOT NULL REFERENCES "PetHotelRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "ownerId" TEXT NOT NULL REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "animalId" TEXT NOT NULL REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "species" TEXT NOT NULL CHECK ("species" IN ('CAT','DOG')), "weightKg" DECIMAL(6,2),
  "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RESERVED' CHECK ("status" IN ('RESERVED','IN_HOUSE','CHECKED_OUT','CANCELLED','NO_SHOW')),
  "actualCheckInAt" TIMESTAMP(3), "actualCheckOutAt" TIMESTAMP(3),
  "billableDays" INTEGER NOT NULL, "walkCount" INTEGER NOT NULL DEFAULT 0,
  "dailyRate" DECIMAL(12,2) NOT NULL, "walkRate" DECIMAL(12,2) NOT NULL, "totalPrice" DECIMAL(12,2) NOT NULL,
  "notes" TEXT NOT NULL DEFAULT '', "source" TEXT NOT NULL DEFAULT 'CRM', "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PetHotelReservation_valid_interval" CHECK ("endsAt" > "startsAt"),
  CONSTRAINT "PetHotelReservation_valid_amounts" CHECK ("billableDays" > 0 AND "walkCount" >= 0 AND "dailyRate" >= 0 AND "walkRate" >= 0 AND "totalPrice" >= 0)
);
CREATE INDEX "PetHotelReservation_installationId_startsAt_endsAt_idx" ON "PetHotelReservation"("installationId","startsAt","endsAt");
CREATE INDEX "PetHotelReservation_roomId_status_startsAt_idx" ON "PetHotelReservation"("roomId","status","startsAt");
CREATE INDEX "PetHotelReservation_animalId_startsAt_idx" ON "PetHotelReservation"("animalId","startsAt");
CREATE TABLE "PetHotelCommandReceipt" ("id" TEXT PRIMARY KEY, "fingerprint" TEXT NOT NULL, "result" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
INSERT INTO "Permission" ("id","code","title","createdAt","updatedAt") VALUES
  ('pet-hotel-permission-read','pet_hotel.read','Просмотр зоогостиницы',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('pet-hotel-permission-operate','pet_hotel.operate','Брони, заезд и выезд зоогостиницы',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('pet-hotel-permission-manage','pet_hotel.manage','Места и условия зоогостиницы',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET "title"=EXCLUDED."title";
INSERT INTO "RolePermission" ("roleId","permissionId")
SELECT r."id",p."id" FROM "Role" r CROSS JOIN "Permission" p
WHERE (r."code"='director' AND p."code" IN ('pet_hotel.read','pet_hotel.operate','pet_hotel.manage'))
   OR (r."code"='administrator' AND p."code" IN ('pet_hotel.read','pet_hotel.operate'))
ON CONFLICT DO NOTHING;
COMMIT;
