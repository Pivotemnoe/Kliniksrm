ALTER TABLE "ClinicConversation" ADD COLUMN "introductionComplete" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ClinicConversation" ALTER COLUMN "introductionComplete" SET DEFAULT false;
ALTER TABLE "ClinicConversation" ADD COLUMN "introductionReminded" BOOLEAN NOT NULL DEFAULT false;
