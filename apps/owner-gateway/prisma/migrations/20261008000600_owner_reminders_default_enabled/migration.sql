-- User requested defaults ON. Preserve every already saved opt-out.
ALTER TABLE "OwnerNotificationPreference" ALTER COLUMN "enabled" SET DEFAULT true;
ALTER TABLE "OwnerNotificationPreference" ALTER COLUMN "appointmentChanges" SET DEFAULT true;
ALTER TABLE "OwnerNotificationPreference" ALTER COLUMN "appointmentReminders" SET DEFAULT true;
ALTER TABLE "OwnerNotificationPreference" ALTER COLUMN "revisitReminders" SET DEFAULT true;
ALTER TABLE "OwnerNotificationPreference" ALTER COLUMN "vaccinationReminders" SET DEFAULT true;
INSERT INTO "OwnerNotificationPreference" ("ownerId", "updatedAt")
 SELECT "ownerId", CURRENT_TIMESTAMP FROM "OwnerSnapshot"
 ON CONFLICT ("ownerId") DO NOTHING;
