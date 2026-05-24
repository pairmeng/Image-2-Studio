# Image-2 Studio 中文文档

Image-2 Studio 是一个多用户、聊天式交互的 AI 生图工作台。项目支持 OpenAI `gpt-image-2` 和 OpenAI-compatible 第三方网关。

## 功能特性

- 多用户账号登录和注册。
- 管理员面板：用户管理、注册开关、平台供应商配置、平台额度、用量和最近历史。
- 每个用户独立保存 API key、历史记录和图片文件。
- 用户 API key 优先，平台 API key 作为 fallback。
- API key 使用 `APP_SECRET` 加密保存。
- OpenAI-compatible 图像模型在网关支持时可用于文生图、图生图和继续编辑。
- 类似 playground 的生图工作台：明亮液态玻璃界面、顶部历史搜索、底部输入器和可收起的生成参数抽屉。
- 历史记录支持搜索筛选、收藏、多选、复制链接、下载和继续编辑。
- 上传图和生成图保存在 `storage/`，并通过受保护接口访问。

## 本地开发

本地开发使用 SQLite。

```powershell
pnpm.cmd install
copy .env.example .env.local
pnpm.cmd run db:sqlite
pnpm.cmd run db:push
pnpm.cmd dev
```

打开：

```text
http://localhost:3000
```

本地至少配置：

```env
DATABASE_URL=file:./dev.db
APP_SECRET=replace-with-at-least-32-random-characters
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_PASSWORD=replace-with-a-strong-admin-password
```

如果 API 路由报 Prisma `P2022`，例如缺少 `AppSetting.siteTitle` 字段，先同步本地 SQLite 表结构，再重启开发服务：

```powershell
pnpm.cmd run db:push
pnpm.cmd run db:generate
pnpm.cmd dev
```

Windows 本地构建默认不会输出 `.next/standalone`，日常验证直接运行：

```powershell
pnpm.cmd run build
```

Docker 镜像构建仍然会生成 standalone Next.js 服务，因为 `Dockerfile` 会在 `pnpm build` 前设置 `NEXT_STANDALONE=true`。如果你需要在 Docker 外手动生成 standalone，可以运行：

```powershell
$env:NEXT_STANDALONE="true"; pnpm.cmd run build
```

使用 pnpm 在 Windows 上生成 standalone 时，Next.js 复制 traced dependencies 会用到 symlink，可能需要开启开发者模式或使用管理员 PowerShell。

## Docker 部署：服务器只拉取镜像

生产部署只使用 GHCR 上已经构建好的镜像。服务器只负责拉取和启动镜像；依赖安装和镜像构建都在镜像到达服务器之前完成。

镜像发布按用途拆开：

- 日常开发使用 `pnpm.cmd run publish:dev`，只推送 `dev-latest` 和 `dev-<short-sha>`。
- 生产环境继续拉取 `latest`。
- `latest` 只允许由正式发布的手动 workflow 更新，且发布 ref 必须是 `v*`。

```text
ghcr.io/pairmeng/image-2-studio:dev-latest
ghcr.io/pairmeng/image-2-studio:dev-<short-sha>
ghcr.io/pairmeng/image-2-studio:<version-tag>
ghcr.io/pairmeng/image-2-studio:latest
```

### 1. 获取部署文件

克隆仓库只是为了拿到 Compose 文件和 `.env.example`，服务器不会构建源码。

```bash
git clone https://github.com/pairmeng/Image-2-Studio.git
cd Image-2-Studio
```

### 2. 配置 `.env`

```bash
cp .env.example .env
nano .env
```

使用默认内置 PostgreSQL 和 Redis 栈时至少修改：

```env
IMAGE_NAME=ghcr.io/pairmeng/image-2-studio
IMAGE_TAG=latest
APP_PORT=3000
POSTGRES_PASSWORD=replace-with-a-strong-postgres-password
APP_SECRET=replace-with-at-least-32-random-characters
INITIAL_ADMIN_EMAIL=admin@your-domain.com
INITIAL_ADMIN_PASSWORD=replace-with-a-strong-admin-password
```

生成 `APP_SECRET`：

```bash
openssl rand -hex 32
```

可选平台供应商配置：

```env
OPENAI_API_KEY=
OPENAI_BASE_URL=
OPENAI_IMAGE_MODEL=
```

每个应用容器内的生图任务并发上限：

```env
IMAGE_JOB_CONCURRENCY=2
IMAGE_JOB_USER_CONCURRENCY=1
```

默认容器并发是 `2`。建议先观察 `/api/health` 里的任务队列指标、内存、CPU、PostgreSQL 连接数和上游网关延迟，再逐步调到 `4`、`6`，最多建议 `8`。`IMAGE_JOB_USER_CONCURRENCY` 用于限制单个用户在单容器内可占用的槽位，默认是容器并发的一半向上取整。如果上游网关较慢、文件存储压力大或服务器内存紧张，请调低这些值；多容器部署时总并发约等于容器数乘以容器并发值。

默认 `docker-compose.yml` 已经包含 Redis 和一个 worker 容器。如果要使用外部 Redis 服务商，在 `.env` 设置 `REDIS_URL`；同一个值会传给 Web 和 Worker：

```env
REDIS_URL=redis://:password@redis.example.com:6379/0
# 如果 Redis 服务商要求 TLS，使用 rediss://:password@redis.example.com:6380/0
IMAGE_QUEUE_PREFIX=image2
IMAGE_WORKER_CONCURRENCY=8
IMAGE_QUEUE_ATTEMPTS=3
IMAGE_QUEUE_BACKOFF_MS=5000
WORKER_DATABASE_CONNECTION_LIMIT=10
```

启用 Redis 后，Web 容器只把生图任务写入 BullMQ 队列，不在 Web 进程里直接生图；`image-2-worker` 服务会消费 Redis 队列。扩容 worker：

```bash
docker compose up -d --scale image-2-worker=4
docker compose logs -f image-2-worker
```

`IMAGE_WORKER_CONCURRENCY=8` 且 4 个 worker 容器时，目标生图并发约为 `32`。实际吞吐仍取决于上游供应商限流、Redis、PostgreSQL 连接数、CPU、内存和共享存储 IO。裸 `pnpm dev` 且没有 `REDIS_URL` 时仍会使用内置进程内调度器；Docker 默认走 Redis。

如果只是通过 `http://SERVER_IP:APP_PORT` 临时测试，可以加入：

```env
AUTH_COOKIE_SECURE=false
```

正式 HTTPS 部署不要设置 `AUTH_COOKIE_SECURE=false`。

### 3. 使用内置 PostgreSQL 和 Redis 启动

一行启动命令：

```bash
docker compose pull image-2-studio && docker compose up -d && docker compose ps && docker compose logs -f image-2-studio
```

```bash
docker compose pull image-2-studio
docker compose up -d
docker compose ps
docker compose logs -f image-2-studio
```

访问：

```text
http://SERVER_IP:3000
```

如果改了 `APP_PORT`，访问对应的宿主机端口。

容器启动时会在 `node server.js` 之前自动执行数据库迁移。默认启动行为：

```env
DB_MIGRATE_ON_START=true
DB_MIGRATE_ATTEMPTS=12
DB_MIGRATE_RETRY_SECONDS=5
```

只有在你准备自己提前执行 `prisma migrate deploy --schema prisma/schema.active.prisma` 时，才建议设置 `DB_MIGRATE_ON_START=false`。

### 4. 切换外部 PostgreSQL 或 Redis

项目只保留一个 `docker-compose.yml`。如果要使用外部 PostgreSQL，请在 `.env` 里设置 `DOCKER_DATABASE_URL`：

```env
DOCKER_DATABASE_URL=postgresql://db_user:db_password@db_host:5432/db_name?schema=public&connection_limit=10
```

如果要使用外部 Redis，在 `.env` 设置 `REDIS_URL`，或者直接修改 `docker-compose.yml` 里两处 `REDIS_URL`。

外部数据库账号需要具备执行 Prisma migration 的权限。如果你想完全停用内置服务，就把 `docker-compose.yml` 里的 `postgres` 或 `redis` 服务块，以及对应的 `depends_on` 一起删掉或注释掉。

### 5. 更新

日常测试镜像从干净的本地工作区发布：

```powershell
pnpm.cmd run publish:dev
```

这个命令会先执行验证，然后推送：

```text
ghcr.io/pairmeng/image-2-studio:dev-latest
ghcr.io/pairmeng/image-2-studio:dev-<short-sha>
```

它不会更新生产 `latest`。

正式发布时，先确保发布提交已经在 `main`，然后创建并推送版本 tag：

```bash
git tag -a v1.2.23 -m "v1.2.23"
git push origin v1.2.23
```

推送 tag 只会运行 Docker build 校验，不会自动发布生产镜像。要发布生产镜像，需要在 GitHub Actions 手动运行 `Build and Publish Docker Image` workflow，选择 branch `main`，并填写：

```text
ref: v1.2.23
publish: true
```

手动发布会推送：

```text
ghcr.io/pairmeng/image-2-studio:v1.2.23
ghcr.io/pairmeng/image-2-studio:latest
```

手动 workflow 成功后，再到服务器更新。

一行更新命令：

```bash
docker compose pull image-2-studio && docker compose up -d && docker compose ps
```

默认栈：

```bash
docker compose pull image-2-studio image-2-worker
docker compose up -d
docker compose ps
```

worker 容器：

```bash
docker compose pull image-2-worker
docker compose up -d --scale image-2-worker=4
docker compose logs -f image-2-worker
```

容器启动时会先执行 Prisma migration，然后启动 Next.js。

### 发布检查清单

打正式版本 tag 前，请在干净工作区运行：

```powershell
pnpm.cmd run verify
$env:PLAYWRIGHT_CHANNEL='msedge'
pnpm.cmd run test:e2e
```

E2E smoke test 会 mock 生图接口，不会调用真实供应商。

手动发布 workflow 成功后，在 Docker 主机上验证默认运行时：

```bash
docker compose pull
docker compose up -d
docker compose ps
docker compose logs --tail=120 image-2-worker
curl http://127.0.0.1:3000/api/health
```

健康检查应显示 `backend=redis`、`queue.ok=true`，并且提交新的后台生图任务后 BullMQ 的 `waiting` 或 `active` 有变化。

### 6. 回滚

把 `.env` 里的 `IMAGE_TAG` 改成旧版本镜像标签：

```env
IMAGE_TAG=<version-tag>
```

然后重新拉取并启动：

```bash
docker compose pull image-2-studio
docker compose up -d
```

如果使用外部 PostgreSQL 或 Redis，使用你修改后的 `docker-compose.yml`。

### 7. 健康检查和日志

```bash
curl http://127.0.0.1:${APP_PORT:-3000}/api/health
docker compose ps
docker compose logs -f image-2-studio
docker compose logs -f image-2-worker
```

外部 PostgreSQL 或 Redis 部署使用你修改后的 `docker-compose.yml`。

### 8. 停止

停止但保留数据：

```bash
docker compose down
```

停止并删除内置 PostgreSQL 和 Redis volume 会清空数据库与队列数据，谨慎使用：

```bash
docker compose down -v
```

## 数据持久化

默认内置部署会持久化：

- PostgreSQL 数据：Docker volume `postgres-data`。
- Redis 数据：Docker volume `redis-data`。
- 上传图和生成图：宿主机目录 `./storage`。

不要随意删除 `storage/`、`postgres-data` 或 `redis-data` volume。

## 备份和恢复

内置 PostgreSQL 备份：

```bash
mkdir -p backups
docker compose exec -T postgres pg_dump -U image2 -d image2 > backups/image2-$(date +%F).sql
tar -czf backups/storage-$(date +%F).tar.gz storage
```

恢复：

```bash
cat backups/image2-YYYY-MM-DD.sql | docker compose exec -T postgres psql -U image2 -d image2
tar -xzf backups/storage-YYYY-MM-DD.tar.gz
```

外部 PostgreSQL 请使用数据库服务商的备份恢复工具，同时仍要备份 `storage/`。

## Nginx 反向代理

正式部署建议使用 HTTPS，并反向代理到应用端口。下面的 `3000` 要替换成 `.env` 里的宿主机 `APP_PORT`；例如 `APP_PORT=3111` 时使用 `127.0.0.1:3111`。

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

生图可能耗时较长，建议把 `proxy_read_timeout` 保持在 `300s` 或更高，避免过早返回 `504 Gateway Time-out`。

每个应用容器最多同时运行 `IMAGE_JOB_CONCURRENCY` 个生图任务，单个用户在单容器内最多占用 `IMAGE_JOB_USER_CONCURRENCY` 个槽位。超出的任务会保持 pending，并由调度器从数据库继续捞取。`/api/health` 会返回当前队列状态、近 1 小时成功/失败数量、平均排队耗时、上游耗时和文件保存耗时。

生图任务现在使用 `ImageJob` 上的轻量数据库 lease 和 heartbeat，因此多个 app 容器可以同时 claim pending 任务，避免同一个任务被重复执行。如果正在执行任务的容器被杀掉，任务会在心跳超时后标记失败并返还平台额度。

如果使用 1Panel/OpenResty，把同样的超时配置加到网站反向代理的高级配置里，然后重载或重启 OpenResty。如果浏览器大约 60 秒失败，但 `docker compose logs -f image-2-studio` 里稍后才出现生图失败日志，通常是站点反向代理先关闭了客户端请求。如果容器日志本身显示 `524`，查看日志里的 `baseUrlHost`，继续排查上游网关链路。

如果生成图片保存失败，检查挂载的 storage 目录是否允许应用用户写入：

```bash
docker compose exec -u nextjs image-2-studio sh -lc 'touch /app/storage/.write-test && rm /app/storage/.write-test'
```

## 常见问题

### `docker compose` 命令不存在

安装 Docker Compose plugin 后验证：

```bash
docker compose version
```

### 容器 unhealthy 或页面打不开

```bash
docker compose ps
docker compose logs -f image-2-studio
curl http://127.0.0.1:${APP_PORT:-3000}/api/health
```

同时检查云服务器安全组、防火墙和端口开放情况。

### 端口被占用

修改 `.env` 里的 `APP_PORT`，然后重启：

```env
APP_PORT=3100
```

```bash
docker compose up -d
```

### 更换 `APP_SECRET` 后 API key 失效

`APP_SECRET` 用于加密保存的 API key。生产部署后不要随意更换；如果必须更换，需要用户和管理员重新保存 API key。

## 目录说明

```text
src/app/                  Next.js 页面和 API 路由
src/components/studio/    Studio UI 组件和 UI 状态 hooks
src/lib/server/           服务端数据库、认证、文件、供应商配置
src/lib/server/providers/ OpenAI provider adapter
src/worker/               图片 worker 的 TypeScript 入口
dist-worker/              Docker 运行时使用的已跟踪 worker 构建产物
prisma/                   Prisma schema 和迁移
scripts/                  Prisma 切换、Docker entrypoint 和镜像发布脚本
tests/                    Node 测试
e2e/                      Playwright smoke tests
storage/                  运行时上传图和生成图；生产环境不要删除
public/                   静态资源以及 generated/upload 占位目录
.next/, .test-dist/       被忽略的本地构建和测试输出
```

## License

Image-2 Studio 使用 MIT License。详见 [LICENSE](./LICENSE)。
