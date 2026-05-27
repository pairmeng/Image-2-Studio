ALTER TABLE "AppSetting" ADD COLUMN "imageQueueMode" TEXT;
ALTER TABLE "AppSetting" ADD COLUMN "imageJobConcurrency" INTEGER;
ALTER TABLE "AppSetting" ADD COLUMN "imageJobUserConcurrency" INTEGER;
ALTER TABLE "AppSetting" ADD COLUMN "imageQueueRedisUrlEncrypted" TEXT;
ALTER TABLE "AppSetting" ADD COLUMN "imageQueuePrefix" TEXT;
ALTER TABLE "AppSetting" ADD COLUMN "imageWorkerConcurrency" INTEGER;
ALTER TABLE "AppSetting" ADD COLUMN "imageQueueAttempts" INTEGER;
ALTER TABLE "AppSetting" ADD COLUMN "imageQueueBackoffMs" INTEGER;
