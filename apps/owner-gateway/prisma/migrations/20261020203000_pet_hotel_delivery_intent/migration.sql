CREATE TABLE "PetHotelDeliveryIntent" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PetHotelDeliveryIntent_pkey" PRIMARY KEY ("id")
);
