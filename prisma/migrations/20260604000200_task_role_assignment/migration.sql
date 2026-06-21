ALTER TABLE "Task" ADD COLUMN "assigneeRoleCode" TEXT;

CREATE INDEX "Task_assigneeRoleCode_idx" ON "Task"("assigneeRoleCode");
