#!/bin/sh
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "Startup failed: DATABASE_URL must be set." >&2
  exit 1
fi

if [ -z "$APP_SECRET" ]; then
  echo "Startup failed: APP_SECRET must be set." >&2
  exit 1
fi

if [ "${#APP_SECRET}" -lt 32 ]; then
  echo "Startup failed: APP_SECRET must be at least 32 characters." >&2
  exit 1
fi

./node_modules/.bin/prisma migrate deploy --schema prisma/schema.active.prisma

exec ./node_modules/.bin/next start
