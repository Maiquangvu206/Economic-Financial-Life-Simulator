# Infrastructure

## Local dev dependencies

Chỉ PostgreSQL và Redis chạy bằng Docker; các service Node/Python chạy trực tiếp để có HMR.

```bash
cp .env.example .env
pnpm infra:up          # postgres + redis + migrate (0001_foundation)
pnpm dev               # web-game, admin, gateway, core, realtime, worker
pnpm ai:dev            # AI service (cửa sổ riêng)
```

- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- Gateway: `http://localhost:3000`
- Core: `http://localhost:4000` (nội bộ)
- Realtime: `http://localhost:5000`
- AI: `http://localhost:8000` (nội bộ)
- Web game: `http://localhost:5173`
- Admin: `http://localhost:5174`

Migration runner trong compose áp dụng mọi `*.sql` trừ `*.down.sql`, theo thứ tự tên file.
Đây là tiện ích dev; production dùng pipeline migration có version table.

## Deployment shape (chưa dựng)

```
Internet
  └─ nginx / LB
      ├─ /            -> static web-game (CDN)
      ├─ /admin       -> static admin (IP allowlist + SSO)
      ├─ /api/*       -> api-gateway
      └─ /socket.io/* -> realtime (Redis adapter, N instances)

Nội bộ:
  gateway -> game-core -> PostgreSQL
                      -> AI service -> LLM provider
  worker -> PostgreSQL + Redis (BullMQ + outbox)
  realtime -> Redis
```

Nguyên tắc: chỉ gateway và realtime được public. Core, worker, AI, PostgreSQL, Redis nằm trong
private network. AI service yêu cầu `x-ai-token`, core yêu cầu `x-internal-token`.
