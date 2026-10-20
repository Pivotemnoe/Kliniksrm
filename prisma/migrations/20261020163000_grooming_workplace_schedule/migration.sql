BEGIN;
ALTER TABLE "GroomingWorkPeriod" ADD CONSTRAINT "grooming_workplace_shift_no_overlap"
EXCLUDE USING gist ("workplaceId" WITH =, tsrange("startsAt","endsAt",'[)') WITH &&)
WHERE ("isActive" AND kind='WORK' AND "workplaceId" IS NOT NULL);
COMMIT;
