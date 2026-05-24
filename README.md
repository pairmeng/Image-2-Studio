# Image-2 Studio

Chinese documentation: [README.zh.md](./README.zh.md)

Image-2 Studio is a multi-user, chat-style AI image generation app. It supports OpenAI `gpt-image-2`, OpenAI-compatible gateways, and fal provider adapters.

## Features

- Multi-user login and registration.
- Admin panel for user management, registration control, platform provider settings, quota, usage, and recent history.
- Per-user API keys, image history, uploaded images, and generated images.
- User API keys take priority over platform API keys.
- API keys are encrypted with `APP_SECRET`.
- OpenAI supports text-to-image, image-to-image, and continue edit.
- fal currently supports text-to-image.
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

## Docker Deployment: Server Pulls Image Only

Production deployment should use the prebuilt GHCR image. The server only pulls and starts the image; all package installation and image building happen before the image reaches the server.

GitHub Actions builds and pushes this image only when a `v*` version tag is pushed, for example `v1.0.6`:

```text
ghcr.io/pairmeng/image-2-studio:latest
ghcr.io/pairmeng/image-2-studio:<version-tag>
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

Required for built-in PostgreSQL:

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
FAL_KEY=
FAL_IMAGE_MODEL=
```

For temporary HTTP testing through `http://SERVER_IP:APP_PORT`, add:

```env
AUTH_COOKIE_SECURE=false
```

Do not use `AUTH_COOKIE_SECURE=false` for a real HTTPS deployment.

### 3. Start with Built-in PostgreSQL

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

### 4. Start with External PostgreSQL

Set `DATABASE_URL` in `.env`:

```env
DATABASE_URL=postgresql://db_user:db_password@db_host:5432/db_name?schema=public
```

Then edit `docker-compose.yml`:

- Delete the entire `postgres:` service.
- Delete the bottom `volumes: postgres-data:` block.
- Delete `depends_on` from `image-2-studio`.
- Delete this internal database override from `image-2-studio.environment`:

```yaml
DATABASE_URL: postgresql://image2:${POSTGRES_PASSWORD:-change-me}@postgres:5432/image2?schema=public
```

Keep `env_file: [.env]`, so the app reads the external `DATABASE_URL` from `.env`.

Then start with the same Compose file:

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

The external database account must be allowed to run Prisma migrations.

### 5. Update

Publish a new image by creating and pushing a version tag after the release commit is on `main`:

```bash
git tag -a v1.0.6 -m "v1.0.6"
git push origin v1.0.6
```

After GitHub Actions finishes, update the server.

One-line update command:

```bash
docker compose pull image-2-studio && docker compose up -d && docker compose ps
```

Built-in PostgreSQL:

```bash
docker compose pull image-2-studio
docker compose up -d
docker compose ps
```

External PostgreSQL:

```bash
docker compose pull image-2-studio
docker compose up -d
docker compose ps
```

The container entrypoint runs Prisma migrations before starting Next.js.

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

For external PostgreSQL, use the edited `docker-compose.yml` described above.

### 7. Health and Logs

```bash
curl http://127.0.0.1:${APP_PORT:-3000}/api/health
docker compose ps
docker compose logs -f image-2-studio
```

For external PostgreSQL, use the edited `docker-compose.yml` described above.

### 8. Stop

Stop but keep data:

```bash
docker compose down
```

Stop and delete the built-in PostgreSQL volume. This deletes database data and should be used carefully:

```bash
docker compose down -v
```

## Persistence

Built-in PostgreSQL deployment persists:

- PostgreSQL data in Docker volume `postgres-data`.
- Uploaded and generated image files in `./storage`.

Do not delete `storage/` or the `postgres-data` volume unless you intentionally want to remove data.

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
src/lib/server/           Server database, auth, files, and provider config
src/lib/server/providers/ OpenAI and fal provider adapters
prisma/                   Prisma schema and migrations
scripts/                  Prisma schema switching and Docker entrypoint
storage/                  Protected uploaded and generated images
public/                   Static assets
```

## License

No license has been declared yet.
