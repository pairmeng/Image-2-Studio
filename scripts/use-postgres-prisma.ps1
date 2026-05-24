$ErrorActionPreference = "Stop"

Copy-Item -LiteralPath "prisma/schema.postgres.prisma" -Destination "prisma/schema.active.prisma" -Force
if (Test-Path "prisma/migrations") {
  Remove-Item -LiteralPath "prisma/migrations" -Recurse -Force
}
Copy-Item -LiteralPath "prisma/migrations_postgres" -Destination "prisma/migrations" -Recurse -Force
pnpm.cmd exec prisma generate --schema prisma/schema.active.prisma
