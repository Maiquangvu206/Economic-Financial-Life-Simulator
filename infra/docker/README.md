# Docker — server nền EFLS

Bộ đóng gói này chạy **toàn bộ backend** bằng Docker Compose:

| Service     | Vai trò                           | Cổng host (loopback) |
| ----------- | --------------------------------- | -------------------- |
| postgres    | Dữ liệu chính                     | 55432                |
| redis       | Realtime adapter + BullMQ         | 6379                 |
| migrate     | Runner migration một lần          | —                    |
| game-core   | Modular monolith, nghiệp vụ       | 4000                 |
| api-gateway | Entry point công khai             | 3000                 |
| realtime    | Socket.IO                         | 5000                 |
| worker      | BullMQ + outbox relay + game tick | 6060 (health)        |
| ai          | FastAPI, đề xuất AI               | 8000                 |

## Chạy

```bash
cp .env.example .env
pnpm infra:stack          # build + chạy toàn bộ backend
pnpm infra:logs           # theo dõi log
pnpm infra:stack:down     # dừng stack
```

Chỉ chạy data store (để dev Node/Python trên host):

```bash
pnpm infra:up
```

Kiểm tra:

```bash
curl http://localhost:3000/health   # api-gateway
curl http://localhost:4000/health   # game-core
curl http://localhost:5000/health   # realtime
curl http://localhost:6060/health   # worker
curl http://localhost:8000/health   # ai
```

## Thứ tự khởi động

```
postgres healthy ─┬─> migrate (completed) ─┬─> game-core healthy ─> api-gateway
                  │                        └─> worker
redis healthy ────┴─> realtime
ai (started) ─────┴─> game-core / worker
```

Compose dùng `condition` thật (không chỉ `depends_on` thường), `healthcheck` cho
mọi service, `init: true`, `stop_grace_period`, log rotation và
`no-new-privileges`.

## Migration

`migrate.sh` ghi nhận từng file đã chạy vào bảng `schema_migrations`, nên chạy
lại nhiều lần vẫn an toàn. Mỗi file SQL tự quản transaction của nó.

## Build image riêng lẻ

```bash
docker build -f infra/docker/node-service.Dockerfile \
  --build-arg SERVICE=game-core -t efls/game-core .

docker build -f infra/docker/ai.Dockerfile -t efls/ai .
```

Node image dùng multi-stage: cài dependency theo lockfile → build workspace →
`pnpm deploy --prod` → runtime Alpine chỉ chứa artefact cần thiết, chạy bằng
user `node` + `dumb-init`.

## Ghi chú vận hành

- Secret bắt buộc: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
  `INTERNAL_SERVICE_TOKEN`. Compose sẽ từ chối chạy nếu thiếu.
- `AI_SERVICE_URL` trong container trỏ tới `http://ai:8000`, không dùng
  `localhost`.
- Database/Redis chỉ bind `127.0.0.1` trên host để tránh lộ dữ liệu.
- Ở production thật, thay Postgres/Redis bằng dịch vụ quản lý hoặc volume bền
  vững, và đặt nginx/TLS phía trước `api-gateway` + `realtime`.

## Chế độ phát triển (auto-reload khi sửa code)

Mount source code trực tiếp vào container, không cần rebuild image mỗi lần:

```bash
docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.dev.yml --env-file .env --profile app up -d --build
```

Khi sửa file trong `services/*/src` hoặc `packages/*/dist`, container sẽ sử
dụng mã mới ngay lập tức (cần restart service để áp dụng nếu không có watcher
bên trong container).

## Triển khai produzione (CI/CD tự động)

Khi push code lên nhánh `main`, GitHub Actions (`.github/workflows/deploy.yml`)
sẽ tự động:

1. Build image multi-arch cho tất cả 5 service (game-core, api-gateway,
   realtime, worker, ai).
2. Push lên registry được cấu hình trong `REGISTRY` secret.
3. Gọi webhook deploy trên server production.

Deploy thủ công từ local:

```bash
REGISTRY=ghcr.io/efls VERSION=v1.2.3 node scripts/deploy.mjs
```

Các secret cần thiết trong GitHub / server:

| Secret | Mô tả |
|--------|-------|
| `REGISTRY` | Địa chỉ registry (ví dụ `ghcr.io/efls`) |
| `REGISTRY_USERNAME` | Tên đăng nhập registry |
| `REGISTRY_PASSWORD` | Token/Mật khẩu registry |
| `DEPLOY_WEBHOOK_URL` | URL webhook để kích hoạt deploy trên server |

## Docker Compose profiles

| Profile | Dịch vụ |
|---------|---------|
| (mặc định) | postgres, redis, migrate |
| `app` | game-core, api-gateway, realtime, worker, ai |

```bash
# Chỉ chạy data store (để dev Node/Python trên host)
docker compose -f infra/docker/docker-compose.yml --env-file .env up -d

# Chạy toàn bộ backend
docker compose -f infra/docker/docker-compose.yml --env-file .env --profile app up -d --build

# Dev mode với auto-reload
docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.dev.yml --env-file .env --profile app up -d --build
```

