#!/bin/sh
set -e

cp prisma/schema.prisma prisma/schema.active.prisma
rm -rf prisma/migrations
cp -R prisma/migrations_sqlite prisma/migrations
pnpm exec prisma generate --schema prisma/schema.active.prisma
