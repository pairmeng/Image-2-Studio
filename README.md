# Image-2 Studio

Image-2 Studio is a multi-user AI image generation workspace for OpenAI `gpt-image-2` and OpenAI-compatible gateways.

Full documentation is maintained in Chinese: [README.zh.md](./README.zh.md).

## What It Does

- Multi-user login, registration, encrypted API keys, and per-user image history.
- Admin controls for users, registration, provider settings, quotas, usage, and recent history.
- Text-to-image, image-to-image, and continue-edit workflows when supported by the configured gateway.
- Docker production deployment through prebuilt GHCR images.
- Redis-backed worker queue for background image generation in Docker deployments.

## Local Development

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

Useful checks:

```powershell
pnpm.cmd run verify
$env:PLAYWRIGHT_CHANNEL='msedge'
pnpm.cmd run test:e2e
```

## Docker Images

Daily development publishing pushes only test tags:

```powershell
pnpm.cmd run publish:dev
```

```text
ghcr.io/pairmeng/image-2-studio:dev-latest
ghcr.io/pairmeng/image-2-studio:dev-<short-sha>
```

Production servers continue to use:

```env
IMAGE_TAG=latest
```

`latest` is updated only by manually running the `Build and Publish Docker Image` GitHub Actions workflow with a `v*` ref and `publish=true`.

## Project Layout

```text
src/app/                  Next.js pages and API routes
src/components/studio/    Studio UI components and hooks
src/lib/server/           Server database, auth, files, jobs, and providers
src/worker/               Image worker TypeScript entrypoint
prisma/                   Prisma schemas and migrations
scripts/                  Prisma, Docker, and image publishing helpers
tests/                    Node test suite
e2e/                      Playwright smoke tests
dist-worker/              Ignored worker build output
storage/                  Runtime uploaded and generated images
```

## License

Image-2 Studio is licensed under the MIT License. See [LICENSE](./LICENSE).
