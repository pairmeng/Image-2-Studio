#!/bin/sh
set -e

cp prisma/schema.postgres.prisma prisma/schema.active.prisma
rm -rf prisma/migrations
cp -R prisma/migrations_postgres prisma/migrations
pnpm exec prisma generate --schema prisma/schema.active.prisma
