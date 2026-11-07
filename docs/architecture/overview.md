# Tổng quan hệ thống

## 1. Bối cảnh (C4 level 1)

```
┌──────────────┐        ┌──────────────┐
│  Người chơi  │        │    Admin     │
└──────┬───────┘        └──────┬───────┘
       │ HTTPS + WSS           │ HTTPS
       ▼                       ▼
┌──────────────────────────────────────────────┐
│              EFLS Platform                   │
│  ┌────────────────┐   ┌───────────────────┐  │
│  │  web-game      │   │  admin            │  │
│  │  React+Phaser  │   │  React            │  │
│  └───────┬────────┘   └────────┬──────────┘  │
│          │ /api, /socket.io    │ /api        │
│          ▼                     ▼             │
│  ┌────────────────────────────────────────┐  │
│  │ api-gateway (auth, rate limit, proxy)  │  │
│  └───────┬────────────────────┬───────────┘  │
│          │ REST               │ WSS          │
│          ▼                    ▼              │
│  ┌───────────────┐    ┌───────────────┐      │
│  │ game-core     │    │ realtime      │      │
│  │ modular       │    │ Socket.IO     │      │
│  │ monolith      │    │ Redis adapter │      │
│  └──┬─────┬──────┘    └───────┬───────┘      │
│     │     │                   │              │
│     │     ▼                   │              │
│     │  ┌──────────────┐       │              │
│     │  │ ai (FastAPI) │       │              │
│     │  │ advisory     │       │              │
│     │  └──────┬───────┘       │              │
│     │         │               │              │
│     ▼         ▼               ▼              │
│  PostgreSQL  LLM provider   Redis            │
│     ▲                                        │
│     │                                        │
│  ┌──┴────────────┐                           │
│  │ worker        │── BullMQ ── Redis         │
│  │ tick/outbox   │                           │
│  └───────────────┘                           │
└──────────────────────────────────────────────┘
```

## 2. Thành phần

| Thành phần             | Trách nhiệm                                            | Được public    |
| ---------------------- | ------------------------------------------------------ | -------------- |
| `apps/web-game`        | Dashboard người chơi, Phaser city map, sàn CK          | Có             |
| `apps/admin`           | Vĩ mô, player management, map editor, AI/event console | Có (allowlist) |
| `services/api-gateway` | Xác thực JWT, rate limit, proxy, gắn danh tính nội bộ  | Có             |
| `services/game-core`   | Domain nghiệp vụ, transaction, outbox, REST nội bộ     | Không          |
| `services/realtime`    | Kết nối Socket.IO, room, presence, fan-out             | Có             |
| `services/worker`      | Game tick, outbox relay, job định kỳ                   | Không          |
| `ai`                   | FastAPI, prompt, provider LLM, guardrail               | Không          |
| `packages/contracts`   | DTO/schema HTTP + socket + enum                        | Build-time     |
| `packages/domain`      | Rule thuần, deterministic                              | Build-time     |
| `packages/ui`          | Component React dùng chung                             | Build-time     |

## 3. Luồng tiêu biểu

### 3.1 Giao dịch tiền (mua đất, trả nợ, khớp lệnh)

1. Client gửi mutation qua gateway.
2. Gateway xác thực JWT, gắn `x-actor-id`, `x-internal-token`, chuyển core.
3. Core mở transaction PostgreSQL, khóa row liên quan, kiểm tra quyền + rule domain.
4. Core ghi state + outbox event trong cùng transaction, commit.
5. Worker relay đọc outbox, publish Redis.
6. Realtime/projection phát event tới room.
7. Client cập nhật qua React Query invalidation hoặc socket.

### 3.2 Game tick (24h thực = 1 năm)

1. BullMQ schedule job `game-tick`.
2. Worker chạy các bước theo thứ tự cố định (aging → lãi → thuê → OPEX → audit → vĩ mô).
3. Mỗi bước idempotent theo `(tick, step)`.
4. Kết quả ghi DB + outbox; snapshot offline recap được tạo.
5. GM AI chỉ đề xuất; worker/core áp dụng trong biên cho phép.

### 3.3 Phiên tòa

1. Core mở case, thu thập bằng chứng, mời các bên vào `courtroom_session:<caseId>`.
2. Người chơi gửi lời khai qua socket; realtime chuyển tiếp.
3. Core gọi AI `/v1/judge` với hồ sơ đã lọc.
4. AI trả proposal; core kiểm tra schema, evidence, luật, quyền.
5. Core quyết định bản án cuối cùng, ghi outbox `case.verdict.v1`.
6. Realtime phát `court:verdict`.

## 4. Cổng & endpoint

| Cổng | Dịch vụ  | Ghi chú                            |
| ---- | -------- | ---------------------------------- |
| 3000 | gateway  | Public REST `/api/v1/*`            |
| 4000 | core     | Nội bộ, yêu cầu `x-internal-token` |
| 5000 | realtime | Public WebSocket `/socket.io`      |
| 6000 | worker   | Health/metrics nội bộ              |
| 8000 | ai       | Nội bộ, yêu cầu `x-ai-token`       |
| 5173 | web-game | Dev server                         |
| 5174 | admin    | Dev server                         |
| 5432 | postgres | Private                            |
| 6379 | redis    | Private                            |

## 5. Đồng bộ contract

- TS: `packages/contracts` dùng Zod, là nguồn cho HTTP + Socket.IO.
- Python: `ai/app/domain/schemas.py` phản chiếu các payload AI.
- Quy trình đổi contract: sửa TS → sửa Pydantic → thêm/sửa test → cập nhật docs → PR.
- Không để AI service tự định nghĩa field mới mà core không biết.
