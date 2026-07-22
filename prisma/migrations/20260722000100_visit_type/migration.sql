CREATE TYPE "VisitType" AS ENUM ('PRIMARY', 'FOLLOW_UP');

ALTER TABLE "QueueEntry" ADD COLUMN "visitType" "VisitType";
ALTER TABLE "Visit" ADD COLUMN "visitType" "VisitType";
