# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ARG PNPM_VERSION=11.1.2
ARG NPM_REGISTRY=https://mirrors.cloud.tencent.com/npm/
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV npm_config_registry=${NPM_REGISTRY}

FROM base AS deps
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm config set registry ${NPM_REGISTRY} \
  && pnpm install --frozen-lockfile \
    --network-concurrency=4 \
    --fetch-retries=5 \
    --fetch-retry-factor=2 \
    --fetch-retry-mintimeout=20000 \
    --fetch-retry-maxtimeout=120000 \
    --fetch-timeout=300000

FROM base AS builder
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN chmod +x scripts/*.sh \
  && DATABASE_URL="postgresql://image2:change-me@localhost:5432/image2?schema=public" scripts/use-postgres-prisma.sh \
  && pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN apk add --no-cache su-exec \
  && addgroup -S nodejs \
  && adduser -S nextjs -G nodejs

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts

RUN mkdir -p storage \
  && chmod +x scripts/*.sh \
  && chown -R nextjs:nodejs /app

EXPOSE 3000

CMD ["scripts/docker-entrypoint.sh"]
