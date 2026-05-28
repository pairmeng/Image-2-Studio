CREATE TABLE "PlatformProviderSetting" (
  "id" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "adapterId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "keyEncrypted" TEXT,
  "baseUrl" TEXT,
  "defaultModel" TEXT,
  "modelsJson" TEXT NOT NULL DEFAULT '[]',
  "capabilitiesJson" TEXT NOT NULL DEFAULT '{}',
  "priority" INTEGER NOT NULL DEFAULT 100,
  "healthStatus" TEXT NOT NULL DEFAULT 'unknown',
  "healthMessage" TEXT,
  "lastHealthCheckAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PlatformProviderSetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserProviderSetting" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "keyEncrypted" TEXT,
  "baseUrl" TEXT,
  "defaultModel" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserProviderSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformProviderSetting_providerId_key" ON "PlatformProviderSetting"("providerId");
CREATE INDEX "PlatformProviderSetting_enabled_priority_idx" ON "PlatformProviderSetting"("enabled", "priority");
CREATE INDEX "PlatformProviderSetting_adapterId_idx" ON "PlatformProviderSetting"("adapterId");
CREATE UNIQUE INDEX "UserProviderSetting_userId_providerId_key" ON "UserProviderSetting"("userId", "providerId");
CREATE INDEX "UserProviderSetting_providerId_idx" ON "UserProviderSetting"("providerId");

ALTER TABLE "UserProviderSetting" ADD CONSTRAINT "UserProviderSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserProviderSetting" ADD CONSTRAINT "UserProviderSetting_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "PlatformProviderSetting"("providerId") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "PlatformProviderSetting" (
  "id",
  "providerId",
  "adapterId",
  "label",
  "enabled",
  "keyEncrypted",
  "baseUrl",
  "defaultModel",
  "modelsJson",
  "capabilitiesJson",
  "priority",
  "healthStatus",
  "createdAt",
  "updatedAt"
)
SELECT
  'platform-openai',
  'openai',
  CASE WHEN COALESCE("openaiBaseUrl", '') = '' THEN 'openai' ELSE 'openai-compatible' END,
  'OpenAI',
  CASE WHEN "openaiKeyEncrypted" IS NULL THEN false ELSE true END,
  "openaiKeyEncrypted",
  "openaiBaseUrl",
  "openaiModel",
  '[]',
  '{}',
  10,
  'unknown',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "PlatformProviderConfig"
WHERE "id" = 'platform'
  AND NOT EXISTS (
    SELECT 1 FROM "PlatformProviderSetting" WHERE "providerId" = 'openai'
  );

INSERT INTO "PlatformProviderSetting" (
  "id",
  "providerId",
  "adapterId",
  "label",
  "enabled",
  "modelsJson",
  "capabilitiesJson",
  "priority",
  "healthStatus",
  "createdAt",
  "updatedAt"
)
SELECT
  'platform-openai',
  'openai',
  'openai',
  'OpenAI',
  true,
  '[]',
  '{}',
  10,
  'unknown',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "PlatformProviderSetting" WHERE "providerId" = 'openai'
);

INSERT INTO "UserProviderSetting" (
  "id",
  "userId",
  "providerId",
  "enabled",
  "keyEncrypted",
  "baseUrl",
  "defaultModel",
  "createdAt",
  "updatedAt"
)
SELECT
  "id" || '-openai',
  "userId",
  'openai',
  true,
  "openaiKeyEncrypted",
  "openaiBaseUrl",
  "openaiModel",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "ProviderConfig"
WHERE ("openaiKeyEncrypted" IS NOT NULL OR "openaiBaseUrl" IS NOT NULL OR "openaiModel" IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM "UserProviderSetting"
    WHERE "UserProviderSetting"."userId" = "ProviderConfig"."userId"
      AND "UserProviderSetting"."providerId" = 'openai'
  );
