CREATE TABLE "ImageJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "requestJson" TEXT NOT NULL,
  "resultId" TEXT,
  "error" TEXT,
  "startedAt" DATETIME,
  "finishedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ImageJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ImageJob_userId_createdAt_idx" ON "ImageJob"("userId", "createdAt");
CREATE INDEX "ImageJob_status_createdAt_idx" ON "ImageJob"("status", "createdAt");
