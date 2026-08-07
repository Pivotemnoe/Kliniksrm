-- Additive staff notification read-state and private employee-to-employee messages.
-- Existing clinic, visit, warehouse and owner-message data is not rewritten.

CREATE TABLE "StaffAlertRead" (
    "employeeId" TEXT NOT NULL,
    "alertKey" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffAlertRead_pkey" PRIMARY KEY ("employeeId", "alertKey")
);

CREATE TABLE "InternalMessage" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InternalMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StaffAlertRead_employeeId_readAt_idx" ON "StaffAlertRead"("employeeId", "readAt");
CREATE INDEX "InternalMessage_senderId_recipientId_createdAt_idx" ON "InternalMessage"("senderId", "recipientId", "createdAt");
CREATE INDEX "InternalMessage_recipientId_readAt_createdAt_idx" ON "InternalMessage"("recipientId", "readAt", "createdAt");

ALTER TABLE "StaffAlertRead"
ADD CONSTRAINT "StaffAlertRead_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InternalMessage"
ADD CONSTRAINT "InternalMessage_senderId_fkey"
FOREIGN KEY ("senderId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InternalMessage"
ADD CONSTRAINT "InternalMessage_recipientId_fkey"
FOREIGN KEY ("recipientId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
