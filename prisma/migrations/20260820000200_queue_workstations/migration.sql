CREATE TABLE "QueueWorkstation" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "label" TEXT,
    "roomId" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QueueWorkstation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QueueWorkstation_deviceId_key" ON "QueueWorkstation"("deviceId");
CREATE INDEX "QueueWorkstation_roomId_idx" ON "QueueWorkstation"("roomId");
CREATE INDEX "QueueWorkstation_lastSeenAt_idx" ON "QueueWorkstation"("lastSeenAt");

ALTER TABLE "QueueWorkstation" ADD CONSTRAINT "QueueWorkstation_roomId_fkey"
FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
