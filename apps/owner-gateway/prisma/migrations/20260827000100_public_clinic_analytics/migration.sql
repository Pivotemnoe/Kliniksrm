CREATE TABLE "PublicClinicAnalyticsEvent" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "eventName" TEXT NOT NULL,
  "section" TEXT,
  "target" TEXT,
  "path" TEXT NOT NULL,
  "referrerHost" TEXT,
  "utmSource" TEXT,
  "utmMedium" TEXT,
  "utmCampaign" TEXT,
  "utmContent" TEXT,
  "deviceType" TEXT,
  "viewportWidth" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PublicClinicAnalyticsEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PublicClinicAnalyticsEvent_eventId_key"
  ON "PublicClinicAnalyticsEvent"("eventId");
CREATE INDEX "PublicClinicAnalyticsEvent_createdAt_idx"
  ON "PublicClinicAnalyticsEvent"("createdAt");
CREATE INDEX "PublicClinicAnalyticsEvent_eventName_createdAt_idx"
  ON "PublicClinicAnalyticsEvent"("eventName", "createdAt");
CREATE INDEX "PublicClinicAnalyticsEvent_sessionId_createdAt_idx"
  ON "PublicClinicAnalyticsEvent"("sessionId", "createdAt");
CREATE INDEX "PublicClinicAnalyticsEvent_utmSource_createdAt_idx"
  ON "PublicClinicAnalyticsEvent"("utmSource", "createdAt");
