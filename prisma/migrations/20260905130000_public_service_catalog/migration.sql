-- Opt-in only: no existing clinical service is published by this migration.
ALTER TABLE "Service" ADD COLUMN "publicOnWebsite" BOOLEAN NOT NULL DEFAULT false;
