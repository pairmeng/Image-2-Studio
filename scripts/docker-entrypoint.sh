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

should_migrate="false"
if [ "${IMAGE_PROCESS_ROLE:-web}" = "migrate" ]; then
  should_migrate="true"
elif [ "${DB_MIGRATE_ON_START:-true}" != "false" ] && [ "${DB_MIGRATE_ON_START:-true}" != "0" ]; then
  should_migrate="true"
fi

if [ "$should_migrate" = "true" ]; then
  attempts="${DB_MIGRATE_ATTEMPTS:-12}"
  delay="${DB_MIGRATE_RETRY_SECONDS:-5}"
  current=1

  echo "Running database migrations before startup..."
  while true; do
    if su-exec nextjs:nodejs node /opt/runtime-node_modules/prisma/build/index.js migrate deploy --schema prisma/schema.active.prisma; then
      echo "Database migrations completed."
      break
    fi

    if [ "$current" -ge "$attempts" ]; then
      echo "Startup failed: database migrations did not complete after ${attempts} attempts." >&2
      exit 1
    fi

    echo "Database migration attempt ${current}/${attempts} failed; retrying in ${delay}s..." >&2
    current=$((current + 1))
    sleep "$delay"
  done
else
  echo "Skipping database migrations because DB_MIGRATE_ON_START=${DB_MIGRATE_ON_START}."
fi

case "${IMAGE_PROCESS_ROLE:-web}" in
  migrate)
    echo "Migration role completed."
    exit 0
    ;;
  worker)
    if [ -z "$REDIS_URL" ]; then
      echo "Startup failed: REDIS_URL must be set when IMAGE_PROCESS_ROLE=worker." >&2
      exit 1
    fi
    exec su-exec nextjs:nodejs node dist-worker/worker/image-worker.js
    ;;
  web)
    exec su-exec nextjs:nodejs node server.js
    ;;
  *)
    echo "Startup failed: IMAGE_PROCESS_ROLE must be web or worker." >&2
    exit 1
    ;;
esac
