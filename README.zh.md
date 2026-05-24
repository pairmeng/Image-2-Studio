# Image-2 Studio 中文文档

Image-2 Studio 是一个多用户、聊天式交互的 AI 生图工作台。项目支持 OpenAI `gpt-image-2`、OpenAI-compatible 第三方网关，以及 fal 供应商适配。

## 功能特性

- 多用户账号登录和注册。
- 管理员面板：用户管理、注册开关、平台供应商配置、平台额度、用量和最近历史。
- 每个用户独立保存 API key、历史记录和图片文件。
- 用户 API key 优先，平台 API key 作为 fallback。
- API key 使用 `APP_SECRET` 加密保存。
- OpenAI 支持文生图、图生图、继续编辑。
- fal 当前支持文生图。
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

## Docker 部署：服务器只拉取镜像

生产部署只使用 GHCR 上已经构建好的镜像。服务器只负责拉取和启动镜像；依赖安装和镜像构建都在镜像到达服务器之前完成。

只有推送 `v*` 版本 tag 时，GitHub Actions 才会构建并推送镜像，例如 `v1.0.6`：

```text
ghcr.io/pairmeng/image-2-studio:latest
ghcr.io/pairmeng/image-2-studio:<version-tag>
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

使用内置 PostgreSQL 时至少修改：

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
FAL_KEY=
FAL_IMAGE_MODEL=
```

如果只是通过 `http://SERVER_IP:APP_PORT` 临时测试，可以加入：

```env
AUTH_COOKIE_SECURE=false
```

正式 HTTPS 部署不要设置 `AUTH_COOKIE_SECURE=false`。

### 3. 使用内置 PostgreSQL 启动

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

### 4. 使用外部 PostgreSQL 启动

在 `.env` 里设置外部数据库连接：

```env
DATABASE_URL=postgresql://db_user:db_password@db_host:5432/db_name?schema=public
```

然后修改同一个 `docker-compose.yml`：

- 删除整个 `postgres:` 服务。
- 删除底部的 `volumes: postgres-data:`。
- 删除 `image-2-studio` 里的 `depends_on`。
- 删除 `image-2-studio.environment` 里的内置数据库覆盖：

```yaml
DATABASE_URL: postgresql://image2:${POSTGRES_PASSWORD:-change-me}@postgres:5432/image2?schema=public
```

保留 `env_file: [.env]`，应用会从 `.env` 读取外部 `DATABASE_URL`。

然后仍然使用同一个 Compose 文件启动：

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

外部数据库账号需要具备执行 Prisma migration 的权限。

### 5. 更新

发布新镜像时，先确保发布提交已经在 `main`，然后创建并推送版本 tag：

```bash
git tag -a v1.0.6 -m "v1.0.6"
git push origin v1.0.6
```

GitHub Actions 构建完成后，再到服务器更新。

一行更新命令：

```bash
docker compose pull image-2-studio && docker compose up -d && docker compose ps
```

内置 PostgreSQL：

```bash
docker compose pull image-2-studio
docker compose up -d
docker compose ps
```

外部 PostgreSQL：

```bash
docker compose pull image-2-studio
docker compose up -d
docker compose ps
```

容器启动时会先执行 Prisma migration，然后启动 Next.js。

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

如果使用外部 PostgreSQL，使用上面按说明修改后的 `docker-compose.yml`。

### 7. 健康检查和日志

```bash
curl http://127.0.0.1:${APP_PORT:-3000}/api/health
docker compose ps
docker compose logs -f image-2-studio
```

外部 PostgreSQL 部署使用上面按说明修改后的 `docker-compose.yml`。

### 8. 停止

停止但保留数据：

```bash
docker compose down
```

停止并删除内置 PostgreSQL volume 会清空数据库，谨慎使用：

```bash
docker compose down -v
```

## 数据持久化

内置 PostgreSQL 部署会持久化：

- PostgreSQL 数据：Docker volume `postgres-data`。
- 上传图和生成图：宿主机目录 `./storage`。

不要随意删除 `storage/` 或 `postgres-data` volume。

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
src/lib/server/           服务端数据库、认证、文件、供应商配置
src/lib/server/providers/ OpenAI 和 fal provider adapter
prisma/                   Prisma schema 和迁移
scripts/                  Prisma schema 切换和 Docker entrypoint
storage/                  受保护的上传图和生成图
public/                   静态资源
```

## License

当前项目未声明开源许可证。发布前请根据实际计划补充 License。
