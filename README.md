# EFLS — Economic & Financial Life Simulator

Game mô phỏng kinh tế, đời sống và xã hội ngầm trên nền tảng HTML5 multiplayer.
Repo này là **bộ khung kiến trúc** tách rõ:

**frontend (2 app) · backend (4 service) · AI (Python) · shared packages · infrastructure · docs**

> Nguyên tắc bất biến: **server-authoritative**, tiền là số nguyên minor units, AI chỉ cố vấn.
> Đọc [docs/architecture/boundaries.md](docs/architecture/boundaries.md) trước khi thêm module.

## Cây thư mục

```
.
├─ apps/                          # FRONTEND
│  ├─ web-game/                   # React 18 + Vite + Tailwind + Phaser + Lightweight Charts
│  │  └─ src/
│  │     ├─ app/                  # bootstrap, providers, router
│  │     ├─ pages/                # composition theo route
│  │     ├─ features/             # vertical slice: finance, real-estate, stocks, law...
│  │     ├─ game/                 # Phaser scenes + React bridge (ranh giới duy nhất)
│  │     └─ shared/               # api, socket, config, layout, ui, format
│  └─ admin/                      # React + Tailwind: macro, players, map editor, AI console
│     └─ src/{app,pages,features,shared}
│
├─ services/                      # BACKEND (Node.js/TypeScript)
│  ├─ api-gateway/                # public entry: JWT, rate limit, proxy, internal trust
│  ├─ game-core/                  # modular monolith
│  │  └─ src/
│  │     ├─ modules/              # auth, characters, banking, real-estate, corporations,
│  │     │                        # stock-market, law, underworld, logistics, education, admin
│  │     └─ shared/               # db, http, events/outbox, logger
│  ├─ realtime/                   # Socket.IO rooms, Redis adapter, chat, presence
│  └─ worker/                     # BullMQ: game tick, outbox relay, jobs định kỳ
│
├─ ai/                            # AI SUBSYSTEM (Python FastAPI)
│  ├─ app/
│  │  ├─ api/v1/                  # judge, news, npc, gm
│  │  ├─ core/                    # config, logging, service-token auth
│  │  ├─ domain/                  # Pydantic schemas, enums, guardrails
│  │  ├─ providers/               # fake, openai, gemini, registry
│  │  ├─ prompts/                 # prompt version hóa
│  │  └─ services/                # use case + prompt loader
│  └─ tests/
│
├─ packages/                      # SHARED
│  ├─ contracts/                  # Zod DTO HTTP + Socket.IO + enums (nguồn sự thật TS)
│  ├─ domain/                     # rule thuần: credit, interest, order book, heat, audit risk
│  └─ ui/                         # component React dùng chung
│
├─ infra/
│  ├─ docker/docker-compose.yml   # PostgreSQL 16 + Redis 7 + migration runner
│  ├─ db/migrations/              # SQL theo bounded context
│  └─ nginx/efls.conf             # reverse proxy mẫu
│
├─ docs/
│  ├─ architecture/               # overview, boundaries, frontend, backend, realtime, ai, security
│  ├─ database/                   # chuẩn schema + quyền sở hữu bảng
│  ├─ adr/                        # quyết định kiến trúc
│  └─ roadmap.md
│
├─ .github/workflows/ci.yml
├─ package.json / pnpm-workspace.yaml / turbo.json / tsconfig.base.json
└─ .env.example
```

## Quick start

Yêu cầu: Node ≥ 20, pnpm ≥ 9, Python ≥ 3.11, Docker.

```bash
cp .env.example .env

pnpm install
pnpm infra:up            # postgres + redis + migration (chạy service trên host)

# Hoặc chạy toàn bộ backend trong Docker (postgres, redis, core, gateway,
# realtime, worker, AI) với healthcheck + thứ tự khởi động:
pnpm infra:stack

pnpm dev                 # web (5173), admin (5174), gateway (3000), core (4000),
                         # realtime (5000), worker (6060)
pnpm ai:dev              # FastAPI (8000) — cửa sổ khác
```

> **Đăng nhập:** chỉ có một cổng duy nhất tại `http://localhost:5173/login`.
> Hệ thống tự định tuyến theo vai trò — `player` vào game, `admin`/`moderator`
> được bàn giao phiên (mã dùng một lần) sang bảng điều khiển `5174`.

Chi tiết Docker: [infra/docker/README.md](infra/docker/README.md).

Kiểm tra:

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm lint
pnpm ai:test
```

## Scripts

| Lệnh                           | Ý nghĩa                                 |
| ------------------------------ | --------------------------------------- |
| `pnpm dev`                     | Chạy song song các app/service Node     |
| `pnpm build`                   | Build toàn bộ workspace qua Turbo       |
| `pnpm typecheck`               | Typecheck từng package/service          |
| `pnpm test`                    | Unit test (domain, contracts, services) |
| `pnpm lint`                    | ESLint toàn repo                        |
| `pnpm format`                  | Prettier                                |
| `pnpm infra:up` / `infra:down` | PostgreSQL + Redis + migrate            |
| `pnpm infra:stack`             | Toàn bộ backend trong Docker Compose    |
| `pnpm ai:dev` / `ai:test`      | AI service / pytest                     |

## Ranh giới trong 30 giây

| Lớp                    | Được làm                             | Không được làm                                       |
| ---------------------- | ------------------------------------ | ---------------------------------------------------- |
| `apps/*`               | Gọi API/socket, render, state UI     | Import service, DB, `@efls/domain`, tính tiền        |
| `services/api-gateway` | Auth, rate limit, proxy              | Chứa nghiệp vụ game                                  |
| `services/game-core`   | Domain use case, transaction, outbox | Import realtime/apps, gọi AI không timeout           |
| `services/realtime`    | Room, presence, fan-out              | Ghi DB, khớp lệnh, tính tiền                         |
| `services/worker`      | Tick, job, outbox relay              | Expose API công khai, viết SQL chéo context tùy tiện |
| `ai`                   | Sinh proposal theo schema            | Truy cập DB, tự áp dụng thay đổi                     |
| `packages/domain`      | Rule thuần, deterministic            | IO, clock, random ẩn                                 |
| `packages/contracts`   | DTO/schema chung                     | Business rule, React component                       |

## Trạng thái scaffold

| Thành phần                               | Trạng thái                              |
| ---------------------------------------- | --------------------------------------- |
| Monorepo + CI + contracts + domain rules | ✅ có test                              |
| Web game shell + Phaser city prototype   | ✅ chạy được                            |
| Admin shell + map editor UI cục bộ       | ✅ chạy được                            |
| Auth/character + migration nền           | ✅ cần chạy DB                          |
| Gateway + realtime + outbox relay        | ✅ skeleton chạy được                   |
| Domain modules còn lại                   | 📄 README + chuẩn, chưa implement       |
| AI service + fake provider + guardrail   | ✅ có test, provider thật cần API key   |
| Docker backend stack + migration runner  | ✅ compose `--profile app`, healthcheck |

Xem [docs/roadmap.md](docs/roadmap.md) cho thứ tự triển khai tiếp theo.
