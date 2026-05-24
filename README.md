# Image-2 Studio

Chinese documentation: [README.zh.md](./README.zh.md)

Image-2 Studio is a multi-user, chat-style AI image generation app. It supports OpenAI `gpt-image-2` and OpenAI-compatible gateways.

## Features

- Multi-user login and registration.
- Admin panel for user management, registration control, platform provider settings, quota, usage, and recent history.
- Per-user API keys, image history, uploaded images, and generated images.
- User API keys take priority over platform API keys.
- API keys are encrypted with `APP_SECRET`.
- OpenAI-compatible image models support text-to-image, image-to-image, and continue edit when the gateway exposes compatible behavior.
- Playground-style image workspace with a bright liquid-glass layout, top history search, bottom composer, and collapsible generation parameters.
- History search and filtering with favorites, multi-select, copy links, download actions, and continue-edit shortcuts.
- Generated and uploaded images are stored under `storage/` and served through protected API routes.

## Local Development

Local development uses SQLite.

```powershell
pnpm.cmd install
copy .env.example .env.local
pnpm.cmd run db:sqlite
pnpm.cmd run db:push
pnpm.cmd dev
```

Open:

```text
http://localhost:3000
```

Minimum local environment:

```env
DATABASE_URL=file:./dev.db
APP_SECRET=replace-with-at-least-32-random-characters
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_PASSWORD=replace-with-a-strong-admin-password
```

If API routes fail with a Prisma `P2022` error such as a missing `AppSetting.siteTitle` column, sync the local SQLite schema and restart the dev server:

```powershell
pnpm.cmd run db:push
pnpm.cmd run db:generate
pnpm.cmd dev
```

Local Windows builds intentionally do not emit `.next/standalone` by default. Use the normal build command for local validation:

```powershell
pnpm.cmd run build
```

Docker image builds still produce a standalone Next.js server because the `Dockerfile` sets `NEXT_STANDALONE=true` before `pnpm build`. If you manually need a standalone build outside Docker, run:

```powershell
$env:NEXT_STANDALONE="true"; pnpm.cmd run build
```

With pnpm on Windows, standalone builds may require Developer Mode or an elevated shell because Next.js copies traced dependencies with symlinks.

## Docker Deployment: Server Pulls Image Only

Production deployment should use the prebuilt GHCR image. The server only pulls and starts the image; all package installation and image building happen before the image reaches the server.

Image publishing is split by intent:

- Daily development uses `pnpm.cmd run publish:dev` and pushes only `dev-latest` plus `dev-<short-sha>`.
- Production continues to pull `latest`.
- `latest` is updated only by the formal manual release workflow for a `v*` ref.

```text
ghcr.io/pairmeng/image-2-studio:dev-latest
ghcr.io/pairmeng/image-2-studio:dev-<short-sha>
ghcr.io/pairmeng/image-2-studio:<version-tag>
ghcr.io/pairmeng/image-2-studio:latest
```

### 1. Get Deployment Files

Clone the repository only to get Compose files and `.env.example`; the server will not build source code.

```bash
git clone https://github.com/pairmeng/Image-2-Studio.git
cd Image-2-Studio
```

### 2. Configure `.env`

```bash
cp .env.example .env
nano .env
```

Required for the default bundled PostgreSQL and Redis stack:

```env
IMAGE_NAME=ghcr.io/pairmeng/image-2-studio
IMAGE_TAG=latest
APP_PORT=3000
POSTGRES_PASSWORD=replace-with-a-strong-postgres-password
APP_SECRET=replace-with-at-least-32-random-characters
INITIAL_ADMIN_EMAIL=admin@your-domain.com
INITIAL_ADMIN_PASSWORD=replace-with-a-strong-admin-password
```

Generate `APP_SECRET`:

```bash
openssl rand -hex 32
```

Optional platform provider settings:

```env
OPENAI_API_KEY=
OPENAI_BASE_URL=
OPENAI_IMAGE_MODEL=
```

Image job concurrency is limited inside each app container:

```env
IMAGE_JOB_CONCURRENCY=2
IMAGE_JOB_USER_CONCURRENCY=1
```

The default container limit is `2`. Raise it gradually to `4`, `6`, and at most `8` after checking `/api/health` job queue metrics, memory, CPU, PostgreSQL connections, and upstream gateway latency. `IMAGE_JOB_USER_CONCURRENCY` limits how many slots one user can occupy in one container; the default is half the container limit, rounded up. Lower either value if the upstream gateway is slow, file storage is busy, or memory is tight. The per-container value multiplies by the number of running app containers.

The default `docker-compose.yml` includes Redis and a worker container. To use an external Redis provider, set `REDIS_URL` in `.env`; the same value is passed to both the web and worker containers:

```env
REDIS_URL=redis://:password@redis.example.com:6379/0
# Use rediss://:password@redis.example.com:6380/0 if your Redis provider requires TLS.
IMAGE_QUEUE_PREFIX=image2
IMAGE_WORKER_CONCURRENCY=8
IMAGE_QUEUE_ATTEMPTS=3
IMAGE_QUEUE_BACKOFF_MS=5000
WORKER_DATABASE_CONNECTION_LIMIT=10
```

When Redis is enabled, the web container enqueues image jobs into BullMQ and does not generate images itself. The `image-2-worker` service consumes the Redis queue. Scale workers for throughput:

```bash
docker compose up -d --scale image-2-worker=4
docker compose logs -f image-2-worker
```

With `IMAGE_WORKER_CONCURRENCY=8` and four worker containers, the target generation concurrency is about `32`, subject to upstream provider limits, Redis throughput, PostgreSQL connections, CPU, memory, and shared storage IO. Bare `pnpm dev` without `REDIS_URL` still uses the built-in in-process scheduler, but Docker runs use Redis by default.

For temporary HTTP testing through `http://SERVER_IP:APP_PORT`, add:

```env
AUTH_COOKIE_SECURE=false
```

Do not use `AUTH_COOKIE_SECURE=false` for a real HTTPS deployment.

### 3. Start With Bundled PostgreSQL and Redis

One-line start command:

```bash
docker compose pull image-2-studio && docker compose up -d && docker compose ps && docker compose logs -f image-2-studio
```

```bash
docker compose pull image-2-studio
docker compose up -d
docker compose ps
docker compose logs -f image-2-studio
```

Open:

```text
http://SERVER_IP:3000
```

If `APP_PORT` is changed, use that host port instead.

The container runs database migrations automatically before `node server.js` starts. Default startup behavior:

```env
DB_MIGRATE_ON_START=true
DB_MIGRATE_ATTEMPTS=12
DB_MIGRATE_RETRY_SECONDS=5
```

Set `DB_MIGRATE_ON_START=false` only if you run `prisma migrate deploy --schema prisma/schema.active.prisma` yourself before starting the app.

### 4. Switch to External PostgreSQL or Redis

The single `docker-compose.yml` contains all services. If you want an external PostgreSQL database, set `DOCKER_DATABASE_URL` in `.env`:

```env
DOCKER_DATABASE_URL=postgresql://db_user:db_password@db_host:5432/db_name?schema=public&connection_limit=10
```

If you want an external Redis provider, set `REDIS_URL` in `.env`, or edit the two `REDIS_URL` lines in `docker-compose.yml`.

The external PostgreSQL account must be allowed to run Prisma migrations. If you want to stop running the bundled services, remove or comment out the `postgres` or `redis` service blocks and the matching `depends_on` entries in `docker-compose.yml`.

### 5. Update

For daily test builds, publish from a clean local working tree:

```powershell
pnpm.cmd run publish:dev
```

This runs verification first and pushes:

```text
ghcr.io/pairmeng/image-2-studio:dev-latest
ghcr.io/pairmeng/image-2-studio:dev-<short-sha>
```

It does not update production `latest`.

For production releases, create and push a version tag after the release commit is on `main`:

```bash
git tag -a v1.2.23 -m "v1.2.23"
git push origin v1.2.23
```

Pushing the tag only runs the Docker build check. To publish the production image, manually run the `Build and Publish Docker Image` GitHub Actions workflow from branch `main` with:

```text
ref: v1.2.23
publish: true
```

The manual release publishes:

```text
ghcr.io/pairmeng/image-2-studio:v1.2.23
ghcr.io/pairmeng/image-2-studio:latest
```

After the manual workflow succeeds, update the server.

One-line update command:

```bash
docker compose pull image-2-studio && docker compose up -d && docker compose ps
```

Default stack:

```bash
docker compose pull image-2-studio image-2-worker
docker compose up -d
docker compose ps
```

Worker containers:

```bash
docker compose pull image-2-worker
docker compose up -d --scale image-2-worker=4
docker compose logs -f image-2-worker
```

The container entrypoint runs Prisma migrations before starting Next.js.

### Release Checklist

Before tagging a release, run the local gates from a clean working tree:

```powershell
pnpm.cmd run verify
$env:PLAYWRIGHT_CHANNEL='msedge'
pnpm.cmd run test:e2e
```

The E2E smoke test mocks image APIs and does not call the real provider.

After pushing the release tag and pulling the image on a Docker host, verify the full default runtime:

```bash
docker compose pull
docker compose up -d
docker compose ps
docker compose logs --tail=120 image-2-worker
curl http://127.0.0.1:3000/api/health
```

The health response should report `backend=redis`, `queue.ok=true`, and BullMQ `waiting` or `active` movement when a new background image task is submitted.

### 6. Roll Back

Set `IMAGE_TAG` in `.env` to an older version tag:

```env
IMAGE_TAG=<version-tag>
```

Then pull and restart:

```bash
docker compose pull image-2-studio
docker compose up -d
```

For external PostgreSQL or Redis, use your edited `docker-compose.yml`.

### 7. Health and Logs

```bash
curl http://127.0.0.1:${APP_PORT:-3000}/api/health
docker compose ps
docker compose logs -f image-2-studio
docker compose logs -f image-2-worker
```

For external PostgreSQL or Redis, use your edited `docker-compose.yml`.

### 8. Stop

Stop but keep data:

```bash
docker compose down
```

Stop and delete the bundled PostgreSQL and Redis volumes. This deletes database and queue data and should be used carefully:

```bash
docker compose down -v
```

## Persistence

The default bundled deployment persists:

- PostgreSQL data in Docker volume `postgres-data`.
- Redis data in Docker volume `redis-data`.
- Uploaded and generated image files in `./storage`.

Do not delete `storage/`, `postgres-data`, or `redis-data` unless you intentionally want to remove data.

## Backup and Restore

Built-in PostgreSQL backup:

```bash
mkdir -p backups
docker compose exec -T postgres pg_dump -U image2 -d image2 > backups/image2-$(date +%F).sql
tar -czf backups/storage-$(date +%F).tar.gz storage
```

Restore:

```bash
cat backups/image2-YYYY-MM-DD.sql | docker compose exec -T postgres psql -U image2 -d image2
tar -xzf backups/storage-YYYY-MM-DD.tar.gz
```

For external PostgreSQL, use your database provider's backup and restore tooling. Still back up `storage/`.

## Nginx Reverse Proxy

Use HTTPS in production and proxy to the app port. Replace `3000` with the host `APP_PORT` from `.env`; for example, use `3111` when `APP_PORT=3111`.

```nginx
server {
    listen 80;
    server_name your-domain.example;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_connect_timeout 300s;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        send_timeout 300s;
    }
}
```

Image generation can take a while. Keep `proxy_read_timeout` at `300s` or higher to avoid premature `504 Gateway Time-out` responses.

Each app container runs at most `IMAGE_JOB_CONCURRENCY` image jobs at the same time, and each user can occupy at most `IMAGE_JOB_USER_CONCURRENCY` slots per container. Extra jobs remain pending and are picked up from the database as running jobs finish. `/api/health` includes the current queue snapshot, recent success/failure counts, average queue wait, upstream time, and file-save time.

The image job scheduler uses lightweight database leases and heartbeats on `ImageJob`, so multiple app containers can claim pending jobs without executing the same job twice. A killed container leaves its running jobs leased until the heartbeat becomes stale; after the timeout they are marked failed and platform quota is refunded.

For 1Panel/OpenResty, add the same timeout directives to the website reverse proxy advanced configuration, then reload or restart OpenResty. If the browser fails at about 60 seconds but `docker compose logs -f image-2-studio` shows the generation request failing later, the site reverse proxy is closing the client request first. If the container log itself shows `524`, inspect the logged `baseUrlHost` and check the upstream gateway chain.

If generated images fail to save, verify the mounted storage directory is writable by the app user:

```bash
docker compose exec -u nextjs image-2-studio sh -lc 'touch /app/storage/.write-test && rm /app/storage/.write-test'
```

## Troubleshooting

### `docker compose` does not exist

Install the Docker Compose plugin and verify:

```bash
docker compose version
```

### Container is unhealthy or page does not open

```bash
docker compose ps
docker compose logs -f image-2-studio
curl http://127.0.0.1:${APP_PORT:-3000}/api/health
```

Also check cloud firewall/security group rules and the local firewall.

### Port is occupied

Change `APP_PORT` in `.env`, then restart:

```env
APP_PORT=3100
```

```bash
docker compose up -d
```

### API keys stop working after changing `APP_SECRET`

`APP_SECRET` encrypts saved API keys. Do not change it after production deployment unless users and admins are ready to save API keys again.

## Project Layout

```text
src/app/                  Next.js pages and API routes
src/components/studio/    Studio UI components and UI state hooks
src/lib/server/           Server database, auth, files, and provider config
src/lib/server/providers/ OpenAI provider adapter
src/worker/               Image worker TypeScript entrypoint
dist-worker/              Tracked worker build output used by Docker runtime
prisma/                   Prisma schema and migrations
scripts/                  Prisma switching, Docker entrypoint, and image publishing helpers
tests/                    Node test suite
e2e/                      Playwright smoke tests
storage/                  Runtime uploaded and generated images; do not delete in production
public/                   Static assets plus generated/upload placeholders
.next/, .test-dist/       Ignored local build and test output
```

## License

Image-2 Studio is licensed under the MIT License. See [LICENSE](./LICENSE).
