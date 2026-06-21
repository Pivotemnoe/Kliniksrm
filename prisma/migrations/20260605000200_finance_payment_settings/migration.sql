CREATE TABLE "PaymentMethod" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "PaymentType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Cashbox" (
    "id" TEXT NOT NULL,
    "officeId" TEXT,
    "title" TEXT NOT NULL,
    "fiscalNumber" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cashbox_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Payment" ADD COLUMN "paymentMethodId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "cashboxId" TEXT;

CREATE UNIQUE INDEX "PaymentMethod_title_key" ON "PaymentMethod"("title");
CREATE INDEX "PaymentMethod_isActive_sortOrder_idx" ON "PaymentMethod"("isActive", "sortOrder");
CREATE UNIQUE INDEX "Cashbox_officeId_title_key" ON "Cashbox"("officeId", "title");
CREATE INDEX "Cashbox_isActive_idx" ON "Cashbox"("isActive");
CREATE INDEX "Payment_paymentMethodId_idx" ON "Payment"("paymentMethodId");
CREATE INDEX "Payment_cashboxId_idx" ON "Payment"("cashboxId");

ALTER TABLE "Cashbox" ADD CONSTRAINT "Cashbox_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "ClinicOffice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_cashboxId_fkey" FOREIGN KEY ("cashboxId") REFERENCES "Cashbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;
