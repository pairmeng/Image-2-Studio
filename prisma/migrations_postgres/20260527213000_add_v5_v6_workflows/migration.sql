ALTER TABLE "ImageRecord" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "ImageRecord" ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "ImageJob" ADD COLUMN "failureCode" TEXT;
ALTER TABLE "ImageJob" ADD COLUMN "failureCategory" TEXT;
ALTER TABLE "ImageJob" ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImageJob" ADD COLUMN "adminActionBy" TEXT;
ALTER TABLE "ImageJob" ADD COLUMN "adminActionAt" TIMESTAMP(3);

ALTER TABLE "ImageBatch" ADD COLUMN "projectId" TEXT;
ALTER TABLE "ImageBatch" ADD COLUMN "archivedAt" TIMESTAMP(3);

ALTER TABLE "ImageProject" ADD COLUMN "archivedAt" TIMESTAMP(3);

ALTER TABLE "PromptTemplate" ADD COLUMN "projectId" TEXT;
ALTER TABLE "PromptTemplate" ADD COLUMN "description" TEXT;
ALTER TABLE "PromptTemplate" ADD COLUMN "tags" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "PromptTemplate" ADD COLUMN "defaultsJson" TEXT;
ALTER TABLE "PromptTemplate" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "PromptTemplate" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "ImageRecord_userId_deletedAt_createdAt_idx" ON "ImageRecord"("userId", "deletedAt", "createdAt");
CREATE INDEX "ImageJob_failureCategory_updatedAt_idx" ON "ImageJob"("failureCategory", "updatedAt");
CREATE INDEX "ImageBatch_userId_projectId_idx" ON "ImageBatch"("userId", "projectId");
CREATE INDEX "ImageProject_userId_archivedAt_updatedAt_idx" ON "ImageProject"("userId", "archivedAt", "updatedAt");
CREATE INDEX "PromptTemplate_userId_projectId_idx" ON "PromptTemplate"("userId", "projectId");
CREATE INDEX "PromptTemplate_userId_deletedAt_updatedAt_idx" ON "PromptTemplate"("userId", "deletedAt", "updatedAt");

ALTER TABLE "ImageBatch" ADD CONSTRAINT "ImageBatch_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ImageProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PromptTemplate" ADD CONSTRAINT "PromptTemplate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ImageProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
