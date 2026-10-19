BEGIN;

-- CreateTable
CREATE TABLE "GroomingStaffNotice" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT,
    "reservationVersion" INTEGER,
    "employeeId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroomingStaffNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroomingPushSubscription" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "remoteDeviceId" TEXT,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "vapidKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSuccessAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroomingPushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroomingPushDelivery" (
    "id" TEXT NOT NULL,
    "noticeId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attemptedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "GroomingPushDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GroomingStaffNotice_dedupeKey_key" ON "GroomingStaffNotice"("dedupeKey");

-- CreateIndex
CREATE INDEX "GroomingStaffNotice_employeeId_createdAt_idx" ON "GroomingStaffNotice"("employeeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GroomingPushSubscription_endpoint_key" ON "GroomingPushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "GroomingPushSubscription_employeeId_expiresAt_idx" ON "GroomingPushSubscription"("employeeId", "expiresAt");

-- CreateIndex
CREATE INDEX "GroomingPushDelivery_status_scheduledAt_idx" ON "GroomingPushDelivery"("status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "GroomingPushDelivery_noticeId_subscriptionId_key" ON "GroomingPushDelivery"("noticeId", "subscriptionId");

-- AddForeignKey
ALTER TABLE "GroomingStaffNotice" ADD CONSTRAINT "GroomingStaffNotice_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "GroomingReservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroomingStaffNotice" ADD CONSTRAINT "GroomingStaffNotice_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroomingPushSubscription" ADD CONSTRAINT "GroomingPushSubscription_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroomingPushSubscription" ADD CONSTRAINT "GroomingPushSubscription_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroomingPushSubscription" ADD CONSTRAINT "GroomingPushSubscription_remoteDeviceId_fkey" FOREIGN KEY ("remoteDeviceId") REFERENCES "RemoteAccessDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroomingPushDelivery" ADD CONSTRAINT "GroomingPushDelivery_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "GroomingStaffNotice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroomingPushDelivery" ADD CONSTRAINT "GroomingPushDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "GroomingPushSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GroomingPushDelivery" ADD CONSTRAINT "grooming_push_status_check"
  CHECK ("status" IN ('QUEUED', 'SENDING', 'SENT', 'CANCELLED', 'FAILED', 'UNKNOWN'));

COMMIT;
