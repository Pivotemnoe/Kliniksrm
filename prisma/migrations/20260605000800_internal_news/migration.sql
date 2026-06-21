CREATE TYPE "NewsPriority" AS ENUM ('INFO', 'IMPORTANT', 'CRITICAL');

CREATE TABLE "NewsPost" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "priority" "NewsPriority" NOT NULL DEFAULT 'INFO',
  "isPinned" BOOLEAN NOT NULL DEFAULT false,
  "audienceRoleCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdById" TEXT,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NewsPost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NewsPostRead" (
  "newsPostId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "NewsPostRead_pkey" PRIMARY KEY ("newsPostId", "employeeId")
);

CREATE INDEX "NewsPost_priority_idx" ON "NewsPost"("priority");
CREATE INDEX "NewsPost_isPinned_publishedAt_idx" ON "NewsPost"("isPinned", "publishedAt");
CREATE INDEX "NewsPost_archivedAt_idx" ON "NewsPost"("archivedAt");
CREATE INDEX "NewsPostRead_employeeId_readAt_idx" ON "NewsPostRead"("employeeId", "readAt");

ALTER TABLE "NewsPost" ADD CONSTRAINT "NewsPost_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NewsPostRead" ADD CONSTRAINT "NewsPostRead_newsPostId_fkey" FOREIGN KEY ("newsPostId") REFERENCES "NewsPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NewsPostRead" ADD CONSTRAINT "NewsPostRead_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
