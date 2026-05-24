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

if ! mkdir -p /app/storage/generated /app/storage/uploads; then
  echo "Startup failed: could not create /app/storage directories." >&2
  echo "Check that the host ./storage mount is writable." >&2
  exit 1
fi

if ! chown -R nextjs:nodejs /app/storage; then
  echo "Startup failed: could not change ownership of /app/storage to nextjs:nodejs." >&2
  echo "Check the host ./storage directory permissions or filesystem support for chown." >&2
  exit 1
fi

if ! chmod -R u+rwX,g+rwX /app/storage; then
  echo "Startup failed: could not set write permissions on /app/storage." >&2
  echo "Check the host ./storage directory permissions." >&2
  exit 1
fi

if ! su-exec nextjs:nodejs sh -c 'touch /app/storage/.write-test && rm /app/storage/.write-test'; then
  echo "Startup failed: /app/storage is not writable by the nextjs user." >&2
  echo "Check the host ./storage directory permissions or the mounted volume configuration." >&2
  exit 1
fi

su-exec nextjs:nodejs ./node_modules/.bin/prisma migrate deploy --schema prisma/schema.active.prisma

exec su-exec nextjs:nodejs ./node_modules/.bin/next start
