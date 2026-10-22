-- Optional referral metadata; retain all existing origins, prices and history.
ALTER TABLE "GroomingReservation" ADD COLUMN "attribution" JSONB;
ALTER TABLE "PetHotelReservation" ADD COLUMN "attribution" JSONB;
